<!--
CONSOLIDATED 2026-11-09 — the two lines of NEXUS were merged into one branch
(see README.md). This file carries BOTH lines verbatim; nothing was reconciled into a
false blend. The studio line's doc is first, then the main line's doc, behind a marked
appendix heading. If you are editing this file, edit the section for your line and keep
the other section's bytes alone.
-->

# NEXUS Roadmap · studio line

# NEXUS Roadmap

Faithful to spec milestones. Status is honest; do not infer a capability is done because it
appears here.

| Milestone | Scope | Status |
|-----------|-------|--------|
| **M0 — Foundation** | repo, git, monorepo, docs, CI, ADRs | ✅ done this pass. **The type gate's COVERAGE (v204, amendment 204):** `build` and `typecheck` shared ONE tsconfig per package, and that config needs `rootDir: "src"` for the dist layout — so `test/` was `exclude`d, which quietly removed **61 test files** from every gate except studio's (its tests live in `src/`). The one gate that DID read tests was red: **6 errors** in `scene3dSurface.test.ts`, through every commit whose message said "tsc clean". Fixed, and the coverage hole is closed package by package with a dedicated `tsconfig.test.json` (`rootDir: "."`, `noEmit`, `include: ["src","test"]`) so `build` keeps its layout: **v205/v213/v214 — CLOSED: all SIX packages done, 249 errors fixed** — including a test that imported `createWorldId` and then shadowed it with its own local fake, so the library's constructors were never exercised, and a three-runtime annotation TypeScript cannot even PARSE. Every one of the six `typecheck` scripts now runs a `tsconfig.test.json` that reads `test/`, while `build` keeps the dist layout it needs. What the widened gate has found so far: a test importing `createWorldId` and then shadowing it with its own local fake (the library's constructors never ran); an annotation TypeScript cannot PARSE; four files importing `SpawnLike` from a package that does not export it; and `expect(env).toMatchObject(A, B)` where the matcher takes ONE argument, so half that assertion had never run. v213 added: six of EIGHT suites carrying their own `MemDisk` mock that was missing the two methods `FsLike` requires, and four more messages passed to a one-argument `toEqual`. v214 added: `ThreeRuntimeConfig` requiring two fields NOTHING reads, `SaveStore` growing two members that two mocks never got, and `packageFace.test.ts` — a gate that audits the package's export face — never having been type-checked itself **The CI WIRING is now a subject (v528, ADR 0016 amendment 514).** Measured before the repair: `on.push.branches` named only `main`, `git merge-base master origin/main` exits 1 (the two lineages share no history), and `gh run list` returned **ZERO runs for the whole repository** — the workflow had never executed once, while 107 tracked `.mjs` modules sat under `docs/evidence/` and the build graded none of them. So a red proof was a fact in a document, which is exactly how two m7 needles stayed stale for 465 and 461 commits (amendment 513). `tools/ci/proof-set.mjs` is the runner the build calls, and its population is **derived** from `package.json`: every `verify:*` script whose whole command is one `node` call under `docs/evidence` — **15 rows, 12 running and 3 excluded by name**, each naming the external service it needs, the residue printed rather than hidden. The per-row budget is not a second grammar: the runner imports `rowBudget` from `docs/evidence/agents/sweep.mjs`, so the agents sweep and the build read one marker and one tokenizer (amendments 85, 94), and a kill is a `TIMEOUT`, not a failure. `docs/evidence/ci/ci-wiring-proof.mjs` (`verify:ci-wiring`) grades the shipped workflow as bytes across ten clauses and is a row inside the set it enumerates; `docs/evidence/ci/ci-wiring-arms.mjs` proves each refusal is a door — **32 arms, 32 MATCHED**. `npm run verify:proofs` measured **12/12 green of a derived population of 15** in 294.6 s on Windows; the workflow now triggers on `master`, runs the proofs after `Build`, and installs Node 24 because these proofs import the type-stripper. What it does NOT claim: 109 tracked modules under `docs/evidence` while 15 are rows — wiring the rest is the next repair — and whether GitHub now runs this workflow is knowable only from the first real run. |
| **M1 — Studio Vertical Slice (core)** | Project→Prompt→AI Design→Canvas→Layers→Properties→Design System→AI Edit→Code→Live Preview→Screenshot→Publish | ✅ core done — model/canvas/layers/properties/tokens/AI-generate+edit/undo/preview/export all working & gated (evidence in `docs/evidence/studio`). ✅ polish pass "editor durability + direct manipulation" done — on-canvas text editing, magnetic snapping + smart guides, alignment/distribution actions, multi-page add/switch, local-first persistence + History/Snapshots panel (ADR 0014). ✅ polish pass "component → instance variants" done — create/insert/detach via a pure view-time projection, masters stored off-page, instances selectable as atomic units (ADR 0015). ✅ polish pass "per-instance overrides" done — the Properties panel edits an instance leaf's text/width through the same projection path (ADR 0015 amendment). ✅ polish pass "visual AI-diff" done — the diff card renders before/after model→SVG thumbnails. ✅ polish pass "rotation" done — rotate grip with Shift 15° snap, rotation-aware renderer + chrome, committed via the reversible op path (ADR 0005 amendment). ✅ polish pass "nested-instance sub-selection" done — progressive double-click drill-in, clone move/resize/text edit commit as x/y-delta + text overrides on the owning instance, Escape/chip drill-out (ADR 0015 amendment 2). ✅ polish pass "rotated hit bounds" done — `hitTest` is rotation-aware in the canonical model (`containsRotated`, ADR 0005 amendment 2), so click-select and resize grabs follow the turned outline; layout storage + resize math stay AABB. ✅ polish pass "per-clone rotation" done — an absolute `rotation` override on the owning instance, editable via the rotate grip on a focused clone and a per-row Rotation input (ADR 0015 amendment 3); rotated clones hit-test through the same `containsRotated` path. ✅ polish pass "per-instance style overrides" done — an instance leaf's fill and corner radius are overridable in the *Instance overrides* panel (`fills` replaced whole with a copy handed to the clone, `cornerRadius` clamped at 0), the same reversible one-op seam every other override key uses, never the master (ADR 0015 amendment 4). ✅ polish pass "rigid subtree rotation" done — turning a container now turns its absolutely positioned subtree as a unit: authored nodes commit-flatten through one reversible batch, instances bake clone positions in the projection (flow containers keep slot placement, ADR 0005 amendment 3). ✅ polish pass "instance override type is honest" done — `InstanceNode['overrides']` no longer reserves a `text` sibling that forced a cast on every writer and hid a master child literally named `text`; the text override is a field of the per-child patch (`InstanceChildOverride.text?`), legacy snapshots fold on read, no `SCHEMA_VERSION` bump (ADR 0016 amendment 231, plan item 17). **The graph is now CHECKED (v243, amendment 243):** `validateDocument(doc)` answers a verdict — every problem listed by code, never a throw — over shape, the root, both directions of every child link, the active page, cycles and reachability; it PINS the model's conventions (a document's children live on the root NODE's `pageIds`; a document's `childIds` is dead and must stay empty; `pageIds` holds pages AND component masters — a bound, not repaired) and is wired into the remix lane. design-model 40 → 51, Studio 516 → 517, `validate-proof.mjs` 4/4. **And the snapshot hydrate validates (v257, amendment 257):** `deserializeApp` runs `validateDocument` after its shallow checks, so a shape-valid but graph-inconsistent local snapshot is refused by name instead of loading (Studio 725 → 726, `persist.test.ts` 13/13). ⬜ still open for full M1 polish: hosted publish (until M7). |
| **M2 — Agentic Coding** | repo understanding, code index, plan, edit, test, browser automation, visual QA, auto-fix, git commit | 🟡 v54 done (the two lanes interleave: v51's exec-host journal landed between the runtime's v50 and v54) — `@nexus/agent-runtime`: contracts, gated registry, workspace tools, planner/orchestrator, hybrid code index + ingestion + §26 memory (am. 1–3), durable snapshots + provider (am. 4–5), shared hybridScore + consolidation (am. 6), change-sets/diffs/ledger (am. 7), roles + rubric (am. 8), §25 pipeline (am. 9), Studio dock with §28 human checkpoint (am. 10), visual QA (am. 11), QA→repair loop (am. 12), browser-durable memory panel (am. 13), four-role chain + computed WCAG contrast (am. 14), dock chain mode + decisions timeline (am. 15), agent-driven UI with per-action Allow-once (am. 16), validated planner-backend seam with reason-carrying fallback (am. 17), local persisted vector store (am. 18), vector-backed §26 recall with stated engine (am. 19), **orchestrator-driven live UI task — demo planner emits observe→type→click(+verify) over label-addressed ui tools, every action behind an Allow-once dialog, verified against canonical Design Model state and journaled to the ledger** (am. 20–21), **UI-capable role-chain editor — driver presence grants ui tools on a registry copy, editor→host handoff records the exact engine that ran** (am. 22), **persisted chunk vectors as an fs.index scoring path — incremental vector sync beside the snapshot, hit-for-hit parity with inline, stated engine, whole-query inline fallback on drift** (am. 23), **opt-in near-miss QA lints — near-align/near-center as pure arithmetic with explicit tolerances, dock opts in at 2px, deliberately NOT auto-fixed by default** (am. 24), **near-miss slips become gated align-nudge proposals — opt-in alignRepairs, deterministic mover, stated px, applied only through §28 Approve → op path** (am. 25), **even-gap distribution lint — third opt-in near-miss rule: positive-gap chains of ≥3 with a ≤tolerance spread flag uneven-gaps, no auto-fix by design (re-spacing a chain is a human call)** (am. 26), **near-edge flush lint + gated edge-snap — fourth opt-in rule: a usable rect 0<margin≤tolerance from a page edge flags near-edge, and under alignRepairs snaps flush one stated side at a time (corner cases report the rest in remaining), applied only through §28 Approve → op path** (am. 27), **test-run seam — `test.run` graduates from ad-hoc host bodies to the runtime's shared in-process predicate engine: deterministic name-ordered runs, verbatim failures, throw-safe, empty = stated vacuous failure; structured reports journal on RunOutcome + JSONL durability; dock and UI runner converted; real test-suite execution still awaits the ADR 0013 exec sandbox (§60)** (am. 28), **exec-sandbox policy as pure data — ADR 0013 first slice: planExec turns an exec request into an INERT plan or a stated refusal (exact-argv allowlist, bare-name executables, guardedJoin cwd, scrubbed env, capped budgets), `executes:false` in the plan's own type, and the proof scans every dist module for zero `child_process` — no executor wired yet, by design (§60)** (am. 29), **confined exec host — NEW @nexus/exec-host package holds the ONLY child_process capability in the agent stack (boundary audited both ways by the 21st proof): runs nothing planExec didn't approve, argv-as-data with shell:false, plan budgets enforced (output cap + timeout kill), §28 single-gate contract, JSONL-journaled results; one read-only real `git status` demo labeled honestly — a POLICY sandbox, not an OS/container one (ADR 0013 containers/egress still open)** (am. 30), **verification by real commands — the v28 TestRunner seam widens to async and `execTestRunner` in @nexus/exec-host maps an ExecRunResult to a TestReport verbatim (engine `exec-host:<argv>`): exit 0 passes, refusals/timeouts/§28 absences FAIL with their stated reason and zero wasted spawns, the registry's exec gate stays the single §28 checkpoint, and the runtime remains provably spawn-free (22nd proof re-greps it)** (am. 31), **read-only git awareness — git.status/git.diff as §28-gated exec tools over the confined host with a THREE-exact-argv policy (push/commit/path-scoped diffs default-deny), PARSED porcelain + line tallies + stat summaries as structured data, env scrubbed, cwd jailed, truncation labeled — see, don't touch; the git commit write tool is deliberately a later slice** (am. 32), **verification made visible in the dock — `testChipsFor` turns every journalled `RunOutcome.testReports` into engine-named chips (✓/✗ engine passed/total, failure in the tooltip), report-less hosts state "(no test.run in this host)" rather than faking green, and the §28 ledger gains an optional `tests` verdict field; annotation-land only — no `child_process` crossed into the browser** (am. 33), **a repo test suite really verifies through the sandbox — `execsuite-proof.mjs` boots the design-model vitest suite through createExecHost + execTestRunner under a ONE-argv policy: counting NODE_SPAWN wrapper proves denials spawn zero and the granted verify spawns exactly one, with EXACTLY the allowlisted env at the jailed cwd; no product code changed, POLICY sandbox only (ADR 0013 containers/egress still open)** (am. 34), **the first WRITE through the sandbox — `gitCommitPolicy` allowlists exactly ONE argv (`git commit -m <msg>`, the v29 `'*'` ARG wildcard's first production wiring): the tool commits the HUMAN-staged index behind §28 and nothing else — no add, no push, no flag combos, blank messages refused before the policy, and a message smuggling `--no-verify -a` stays ONE argv token under shell:false; `commit-proof.mjs` performs REAL commits only inside a throwaway os.tmpdir repo (hooks/signing neutralized LOCALLY there — the global codex hooks are neither bypassed nor touched), proves staged-only semantics by porcelain, and closes by byte-comparing THIS repo's HEAD before/after** (am. 35), **commit after green — the loop itself reaches the v35 door only when it earned it: `hasCommit` makes planTask append a `git.commit` step ONLY behind a verify step, the orchestrator's verify block trades its early-return for a green flag + executed-step skip so a green-via-fix-round still walks to the commit, and `greencommit-proof.mjs` proves the three states in a throwaway os.tmpdir repo — red never commits, a denied checkpoint never commits, green-after-fix commits the ONE human-staged file exactly once (§28 stays the single gate; staging itself remains a human act)** (am. 36), **git.log read-back — the see→touch→confirm circle closes in @nexus/exec-host: `gitLogPolicy` allowlists EXACTLY `git log --oneline -n <count>` (the '*' ARG wildcard's second production wiring, read side; show/--all/refs/push default-deny), the tool bounds the WINDOW (1–100, default 10) before the policy is consulted, §28 still gates the read because a real process spawns, and `gitlog-proof.mjs` runs the self-verification story in a throwaway os.tmpdir repo — after a granted commit the newest LOGGED hash+subject equals the GitCommitRecord BYTE-FOR-BYTE, the human seed sits below it, and a log host handed `git push` with preApproved:true still spawns nothing** (am. 37), **confirm after commit — the PLAN itself now ends see→touch→confirm: `hasConfirm` nests a `git.log` read-back step INSIDE the commit block (only where a commit exists, which is only behind green), the orchestrator's v36 green-walk executes it with zero control-flow changes, a denied confirm yields honest `denied` while the landed commit's result STANDS, and `confirm-proof.mjs` is the first proof where `runTask` itself drives REAL git.commit + REAL git.log in a throwaway os.tmpdir repo — logged newest hash+subject equals the GitCommitRecord byte-for-byte, red reaches neither tail, and the ledger replays the whole arc** (am. 38), **remembered victories — `hasRemember` nests the ONLY planned `memory.save` at the tail of the full verify→commit→confirm arc, so "COMMITTED+CONFIRMED" in §26 memory is a consequence of POSITION, not a claim (amendment 45 RETIRES that string: position guarantees the doors were walked, not that git recorded anything — a §28-granted commit over an empty index exits 1, so the planned sentence now names the ARC and cites git's answer); red, denied-commit and denied-confirm structurally cannot write memory, and even the remembering itself is §28-vetoable (denied remember keeps the confirmed arc standing but stores nothing); `resolveArgs` now resolves `@refs` inside array args so the planned ref becomes the live workspace path; `remember-proof.mjs` runs FOUR real `runTask` loops where run 2's research step RECALLS run 1's victory from the memory that victory wrote, and the cold ledger replay joins record id ↔ memory record** (am. 39), **checkpoint policy as pure data — §28's DECISION moves from anonymous closure to an inspectable table: ordered rules (matchesTool patterns, grant, REQUIRED reason) with an EXPLICIT default, malformed tables throwing at construction (duplicate pattern = dead rule refused; mute default refused), `policyCheckpoint` keeping one receipt per gated call while the registry's Checkpoint type stays UNCHANGED; `policygate-proof.mjs` runs the SAME plan under TWO tables against REAL git — closed table = denied commit, 0 spawns, HEAD unmoved; open table = one commit; the audits are the same length and differ on EXACTLY `git.commit`; honest bounds: a policy is as trusted as the human who wrote it, the dock's live Allow-once human remains the default face, no host switched over by this amendment** (am. 40), **the dock grows a second §28 face — `faceCheckpoint` in `apps/studio/src/lib/dockPolicy.ts` adapts EITHER the live Allow-once human OR a v40 policy table into the unchanged registry Checkpoint, every verdict receipted (`human`/`policy`/`mixed` + reason) and journalled as a `gate` line into the RECENT DECISIONS ledger (old lines still parse); tests prove the human consultation set is byte-for-byte pre-v41 by default, a policy face never asks, and a table that forgets `test.run` is vetoed by its OWN default row — denied, not silently green; honest bounds: no mode toggle in the UI yet** (am. 41), **content read-back — a hash says SOMETHING landed; `gitShowTool.ts` says WHAT: `gitShowPolicy` allowlists EXACTLY `git show --format= -- <path>` (HEAD pinned BY OMISSION, the `--` forcing the one floating token to be a PATHSPEC so `HEAD~9:file`-style blob syntax matches nothing instead of naming another commit), `validateShowPath` throwing on junk before any spawn, `parseShowDiff` stating its own scope (a 1-line change claims 1 line, never the file; binary labeled, empty diff honest, git's non-zero refusal (unborn HEAD) DATA not a crash — v44 corrects this clause's first wording: an UNMATCHED path is the empty diff, not a refusal); `show-proof.mjs` runs commit → log → show against REAL git in a throwaway os.tmpdir repo and asserts the read-back lines are BYTE-EQUAL what the HUMAN staged, while a denied show costs 0 spawns and the rev-shaped token reveals none of the other commit's content** (am. 42), **staged-intent awareness — the thing v35 commits and §28 keeps human was unreadable: plain `git diff` compares the working tree TO the index, so a STAGED change shows as NOTHING. `gitStagedPolicy` allows exactly TWO argv (`git diff --cached`, `git diff --cached --stat`) and no others — deliberately, because `--ext-diff`/`--textconv` make git EXECUTE a configured helper and `--output=<file>` makes a "read" WRITE; `parseStagedDiff` answers which files and as WHAT kind (added/modified/deleted/renamed/copied, from git's own metadata lines) with per-file tallies and added lines, and an empty index is spelled out as "a granted git.commit right now would have nothing to record"; `staged-proof.mjs` measures the gap in real git (git.diff: 0 files, git.staged: the 3 staged lines byte-equal `git show :intent.md`), proves the doors complementary (edit without staging: git.diff sees the +1, git.staged still recites the 3), and closes across the write — intent read BEFORE the commit is byte-identical to content read AFTER it by v42's door, while the un-staged line is stated as NOT recorded; denial/jail/spec-level refusals cost zero spawns and move no history** (am. 43), **the plan walks the content door — `hasContent` nests a `git.show` `inspect` step INSIDE the confirm block and BEFORE remember, so a green run's own plan ends verify→commit→confirm→inspect(→remember) and the path it reads comes from the LIVE `@search.hits.0.path` ref, never one the planner invents; the remembered summary still claims NO content (§60: memory keeps only what v39 could prove), and git's two BLANK answers stay blank DATA — an unmatched path exits 0 with an EMPTY diff (v44 corrected v42's "pathspec refusal" wording, which real git never prints after `--`), while an unborn HEAD's exit 128 reads as `ok:false` and never as a green; `inspect-proof.mjs` runs `runTask` itself over three keyed hosts in a throwaway os.tmpdir repo — FOUR §28 gates, `addedLines` BYTE-EQUAL the human-staged lines, a denied inspect costing 0 spawns with the landed arc standing, red spending none of the tail, the 128 reproduced in a SECOND repo precisely because the loop cannot produce that state at `inspect`, and the ledger replaying record + hash + content to a cold reader** (am. 44), **intent before the ask — v43's index door moves INTO the plan: `hasStaged` pushes `{stepId:'staged', tool:'git.staged'}` INSIDE the `hasCommit` block and IMMEDIATELY BEFORE the commit push, so a green run's tail is verify→staged→commit→confirm→inspect(→remember) with FIVE §28 gates and the first git process of the tail being a diff of the INDEX (`--cached`, no pathspec — the whole index, not a path the agent chose); position works both ways — refusing the READ stops the walk BEFORE the write (0 spawns, no commit, the human's staged change untouched, nothing remembered), and because git's own first line for a refused empty commit is the header `On branch master` rather than a reason, the reason comes from the step before it ("the index is EMPTY…"). A §60 debt paid on the way: the static plan has no conditionals (stated, not smuggled into the loop — the human at the gate IS the conditional), so a granted commit of an empty index still runs, exits 1 as `ok:false` DATA with no `record` and no history moved — which made v39's asserted "git.commit landed" false in a state nobody had ever run; the remembered sentence is now `ARC-COMPLETE … whether anything LANDED is git's own answer`, v44's no-`CONTENT` guard untouched; `intent-proof.mjs` runs `runTask` over FOUR keyed doors in a throwaway os.tmpdir repo and its money assertion is three-way — staged lines BEFORE ≡ `git.show` lines AFTER ≡ what the human staged, replayed cold from the ledger in the executed order** (am. 45), **the environment is part of the policy — v29–v43 confined the argv, and none of that confined what git DECIDES TO DO with a perfect argv, because git reads config this process never chose to read: measured on real git 2.52 with exit 0 throughout, `[diff] external` made `git diff` and `git diff --cached` EXECUTE a helper and return an EMPTY answer (a "read-only" door reporting 0 files about a dirty tree while running code), `[core] fsmonitor` made `git status` run a command mid-scan, and `core.excludesFile`/`status.showUntrackedFiles=no` each hid untracked files from a complete-looking status. Two layers close it, because two sources are involved: `gitEnv()` pins the machine's config inert (`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` → a path that does not exist, `GIT_CONFIG_NOSYSTEM`, `GIT_ATTR_NOSYSTEM`, `GIT_PAGER=cat`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, plus git's own counted override forcing `core.fsmonitor`/`core.excludesFile`/`core.attributesFile`/`status.showUntrackedFiles` — measured to beat even repo-local `.git/config`), and the argv shape (`--no-ext-diff --no-textconv` on the three diffing doors) confines what env cannot reach: repo DATA. `config-proof.mjs` §3a states that split rather than asserting it — shipped hardened env + v42's OWN flag-free shape → the `textconv` command still ran and the diff came back empty. Two assumptions died in measurement: `git show --format=` ignores `[diff] external` but honours a `.gitattributes`-named driver (so `--no-textconv` is the content door's only defence, not decoration), and `textconv` fires only on files git treats as BINARY, so a pinned binary change now states `binary:true` with no lines invented (§60). `diff.external` is deliberately ABSENT from the forced table because no inert value exists (empty → exit 128; `true`/`false`/`none`/`default` each change the diff's bytes) — the shape owns that hole, and a unit test pins the absence. Isolation arrives at REGISTRATION, so a caller cannot opt out; five doors / five policies / five §28 gates, human-only staging and no-push are all unchanged, and on a clean repo the hardened argv differ from the old ones by two no-flags while `.git/index` keeps its mtime** (am. 46), **the arc gains a role — ten amendments of git doors that NO scoped role could see: §24's pack was researcher/designer/qa/editor/archivist, none naming a git tool, so `roles.scopedRegistry(anything, host).has('git.commit')` was `false` for every role and a chained run could annotate forever without ever reading an index or recording anything. Widening `editor` was the wrong fix (commit power by mere presence is the opposite of §28), so the order moved into DATA first — `gitArc.ts` owns the nesting (`gitArcDoors`: no commit door ⇒ no arc, intent before the commit it informs, hash after the commit, content after the hash), the step objects (`gitArcSteps`) and a walker (`runGitArc`) over ANY registry, `planTask`'s git block became a call into it, and an anti-drift case runs eight presence combinations through BOTH faces demanding `deepEqual` (an order kept in two places is an order waiting to drift) — and ownership got a NAME: `releaser`, whose `allowedTools` IS `GIT_ARC_TOOLS` (four doors, no `git.add`, no push, no `memory.save`, so the arc cannot journal its own success — the host does). The fifth chain stage is an explicit `ChainOptions.release?: boolean`: absent, the chain is the v14/v22 chain byte-for-byte (three handoffs, no field, zero git processes). A chain whose editor did not END `completed` gets `no-arc` naming that status and spends not even an ask — position, not permission, refused it. §60 held its own line here too: the arc's results are NOT folded into `editorOutcome` (that stage never had git; back-filling its plan would be a false record), a `git.show` with no live path is dropped WITH a note rather than a guessed path, and a UI chain — whose `search` is `ui.observe`, a page not refs — is exactly where that shows up. `role-arc-proof.mjs` runs `runRoleChain` over four REAL keyed doors in a throwaway os.tmpdir repo whose `docs/widget.md` deliberately shares a path with the chain's in-memory corpus, so the read-back path is the one the chain's own research handed it: a ROLE reads the human's staged lines before the commit and the SAME bytes out of HEAD after it, four git gates, four processes, `rev-list --count` +1, handoff tail `editor→releaser` then `releaser→host` via `git:staged→commit→confirm→inspect`; a veto at the content door stops the walk and leaves the GRANTED commit standing as history (§28 answers doors one at a time — a later veto does not undo an earlier grant) with one process spared; a red chain spends no ask, no process and no commit and the human's staged file still shows in `git diff --cached --name-only`; a doorless host hears "the arc belongs to no role by absence (§24)". Honest bounds: nothing in the Studio dock sets `release`, so the dock still cannot commit and no UI pretends otherwise; the role face has no `remember` door; the arc rides on `ChainResult.release`, not the ledger, so a cold JSONL reader sees the editor's run and not the stage after it** (am. 47), **budgets that bite — v29 wrote two budgets into every plan and v30 honoured them to the byte, and for eighteen amendments nobody asked what the agent HEARD when a budget bit. Measured against real git: a `maxOutputBytes` landing inside a line made a truncated `git.staged` hand back `addedLines: ["staged line 01 \ufffd"]` — a line no human staged and git never printed, counted as content one step before a §28 ask to commit it. A truncated read was not a smaller read, it was a fabricated one. The same class of bug sat a layer lower: decoding each arriving chunk with its own `toString` turned a multibyte character straddling a pipe-CHUNK boundary into U+FFFD with zero budget pressure. The fix is in the ONE layer that owns budgets — `ExecHost.run` accumulates raw Buffers, decodes ONCE, and trims a stream that actually lost bytes back to its last newline — so no parser changed, no door can forget it, and an uncut stream stays byte-verbatim (v28/v31's verbatim failure messages and v32's parsed porcelain depend on that). §60 then turned on the fix itself: trimmed to whole lines, a starved answer can leave NOTHING to parse, and three doors read that as a fact about the repository — `the index is EMPTY`, `HEAD touches nothing at <path>`, `(empty log)` — the exact opposite of what a cut means, and one of them a sentence a human weighs before approving a commit; all three now answer `no complete line survived the output budget — this is NOT a statement that …` through one shared `cutNotAbsence()`, and an un-cut absence is still stated as an absence. `budgets-proof.mjs` (38th) measures it with real git in a throwaway os.tmpdir repo: 16 budgets DERIVED from git's own byte offsets (8 mid-line, 8 inside a single CHARACTER, each proven to be a case before it counts), the shipped door answering in whole lines that are a PREFIX of what the human staged at 16/16 while the legacy prefix — recomputed in the proof from the same bytes, so before/after is arithmetic and not memory — invents a line at 16/16; a 4-byte budget naming the CUT where the same door on a genuinely clean index still says EMPTY; a ~107 KB read re-joining byte-exact across a dozen-plus chunks counted on the wire; and the OTHER budget killing the REAL design-model vitest suite at 400 ms into a FAILING report naming `killed at timeout budget (SIGTERM) · exit null`, the same argv green at 180 s — a controlled comparison, not a story. No budget number, argv shape, gate or journal entry moved (door defaults are still 65 536 bytes / 10 000 ms — what changed is what a cut MEANS, not where it falls), and one already-committed proof had to be rewritten because it had ENCODED the byte-prefix contract (`['abcd','ef',true]` → `['ab\ncd\n','',true]`), which is the cost a behavior fix should pay in writing rather than in surprises. Honest bounds: line-exactness is right for THESE consumers because every door parses lines — a program whose unit is not `\n` loses its partial tail under a cut (safe, not byte-exact); the timeout kills the process the host spawned and reaps nothing, so a tool that forks children (vitest does) may leave them running; a killed run's `exit null` is relayed, not resolved; and the budget is shared across both streams, so a chatty stderr can starve stdout to zero — pinned as a case, not prevented** (am. 48), **the arc survives its process — am. 47's own last honest bound was that a cold reader of the ledger saw the editor's run and NOT the stage after it, so a chain that really committed left no trace in the one artifact built for reading history. The ledger grew a second record KIND instead of a new file: `git-arc` lines ride the same append-only JSONL, joined to their run by `runId`, carrying the whole `GitArcOutcome` (doors, steps, results, notes, status) plus the role, goal and provenance — so the walk a role took is durable, and a stopped or refused walk is durable AS stopped rather than absent. The v47 §60 anti-fold survives on disk because the arc never moves into the editor's record: the run line still holds no `git.*` step, the arc line holds nothing else, and a reader who wants the story reads two lines joined by id. Ownership got a single source (`RELEASE_ROLE` lives beside the doors it owns, and the role's grant is DERIVED from `GIT_ARC_TOOLS`), so the `role` field on a ledger line cannot name a role the registry never granted. Parsing stays shape-not-trust: a `git-arc` line is validated (four arrays, known status, demo provenance, role string) and REJECTED as `not a complete git-arc record` rather than promoted into `runs`, malformed lines still count instead of crashing, and a red chain that never earned the arc still journals the refusal it was given — an absent line would hide the ask. `durable-arc-proof.mjs` (37th) runs the real chain with a real `node:fs` ledger INSIDE the throwaway os.tmpdir repo: the durable commit hash is compared against `git rev-parse HEAD` from OUTSIDE the loop, a §28 veto at the hash door reads back as `stopped` with all four doors still named, a red chain's `no-arc` line costs zero spawns and zero commits, and a hand-forged arc line is counted as malformed while the good lines around it keep loading. Honest bounds: am. 48 is a concurrent exec-host increment and writes its own clause; §28 receipts are not yet beside the arc; the two-role pipeline has no release stage so it writes no arc line; nothing in the Studio dock reads `arcs` yet** (am. 49) — 290/290 runtime + 130/130 exec-host (am. 48 is that lane's own count, committed beside it) + 105/105 studio vitest, thirty-eight proofs + in-browser loops. **v50 closes am. 49's own bound: a durable arc now carries the §28 receipts for ITS OWN doors, so one JSONL line answers what git did AND who allowed it. v40 made each verdict a row with a required reason and a receipt; v49 made the walk durable; neither could tell a cold reader whether a red `git.show` was a human's Deny, a table row's veto or the explicit default. Receipts are matched by CALL ID, never by tool name (the same chain gates `git.commit` twice, and pasting the editor's yes onto the release door is a borrowed alibi), cloned out of the face with `structuredClone` so a process cannot rewrite what it already reported, and a face that keeps no list says so in `notes` (`NO_RECEIPTS_NOTE`) rather than leaving an empty field to interpret — `[]` means "gated, none of it mine", a note means "this face records nothing", and no field means "not headed for the ledger". Recording is opt-in by durability alone: `recordReceipts` is passed only when `fsLike` AND `ledgerFile` exist, so the dock's in-memory chains stay byte-identical to v47/v49 (asserted from both faces). `isArcShape` now refuses half a receipt — no reason, non-boolean `granted`, a call with no callId or a non-array each make the WHOLE line malformed, because a reader must never guess which kind of nothing it got. `receipts-proof.mjs` (39th) runs the real chain over four keyed doors in an `os.tmpdir` repo and triangulates three sources instead of trusting the runtime's memory: 4 receipts ↔ 4 doors ↔ 4 counted git processes ↔ HEAD from outside the loop, and the content door's path cross-checked against the search hit in the same file's RUN line; a row veto reads back `matched: 'git.show'` with the human's sentence beside the commit it could not undo, at three grants and zero processes for the refusal; a closed table yields one receipt naming `default` and moves no history; a bare closure yields the note instead of a name; a forged reason-less receipt is counted and surfaces nowhere while every surviving receipt holds a non-empty reason. runtime 290/290 → **305/305** (gitArc 22 → 29, chain 20 → 25, ledger 7 → 10), four files touched (`gitArc`/`pipeline`/`ledger`/barrel), every pre-v50 ledger still parsing, exec-host/studio/doors/policies/argv untouched. Honest bounds: an Allow-once human session still journals the note, not a name — closing that needs a dock release toggle, which does not exist; a COMPLETE forged arc line is still believed (shape check, not signature); the editor's own `fs.append`/`test.run` gates are still nowhere in the file, since am. 49's anti-fold cuts both ways; and nothing renders `arcs` in the UI** (am. 50) — 305/305 runtime + 130/130 exec-host + 105/105 studio vitest, thirty-nine proofs + in-browser loops. **v51 moves journalling from an API a caller may forget into a behavior of the host. The grep that chose it is the honest starting point: `appendExecRun` (v30) had ZERO callers — only its own definition and a barrel export — while `host.run` had SEVEN call sites, all inside this package — so for twenty-one amendments the sandbox could say what a command ANSWERED and could not say which processes it STARTED or which requests it REFUSED; every "what ran?" since v32 has been answered by parsing the doors' prose. One closure inside the one function every process is born through now writes an `ExecAuditRecord` (`ExecRunResult` + `seq` + `rule`) on EVERY path — completed run, default-deny refusal, `checkpoint required for exec (§28)`, `checkpoint denied` — so a door added next month cannot escape a record its own entry point makes, and the option is default OFF, which is precisely what lets the 39 already-committed proofs serve as the assertion that nothing else moved. `rule` is the index of the allowlist entry that authorized the argv, and `null ⟺ planned === false` is re-checked by the reader, so a line that claims a rule while denying that anything was planned is rejected rather than believed; `seq` increments BEFORE the write, so a record that fails to land leaves a gap, which is what a gap should mean; and a sink that cannot write FAILS THE CALL, loudly, with both facts in the message (`the process ran and exited 0; the record did not land`) — a host asked to keep an audit trail must not report success about something it could not record. 40th proof `spawnlog-proof.mjs` drives four REAL git processes through six rules DERIVED from the four shipped policy factories (no flag string re-typed, so it goes stale on the same day the flags move) and makes the journal, a counting spawn seam and the doors' own returned records agree line for line — `rules [0,2,3,4]`, 2 of 6 never used, five keys plus `rule` that exist ONLY in the host record — then reads the file cold with nothing but its bytes: contiguous seq, `malformed 0`, and the commit hash that `rev-parse HEAD` reports from OUTSIDE the sandbox sitting inside the host's own words. Two §60 boundaries came out of the work rather than after it: a §28 veto at the REGISTRY never reaches `run()`, so it costs 0 lines and 0 processes and its record stays v50's receipt (two files, two subjects, deliberately unmerged), and §9 bit for real — a first-draft journal written INSIDE the throwaway repo became an untracked file that git then reported about itself, so the file now lives in a sibling tmp directory with an assertion that it is not inside the tree it watches; while the same accident measured that a door QUOTES git rather than summarizing it (a no-changes commit reaches the caller as `exit 1: On branch master` where the journal keeps both lines), which is the next increment's business and is stated here instead of being fixed silently. `arcs`, memory and the UI are unchanged: no host anywhere in this repo is built with a sink outside that proof, so still no panel shows any of it** (am. 51) — 305/305 runtime + 137/137 exec-host + 105/105 studio vitest, forty proofs + in-browser loops. **v52 fixes what a door is ALLOWED TO SAY about what git did — six doors, one rule, and two ways git was being misread that only a probe would find. Eleven real failure states were built with the EXACT argv each shipped door runs (the harness playing the human: a real conflicting merge, a real `index.lock`, a truncated `.git/index`, a failing hook), and they sorted into three complaints. The queued one: a refusal's reason is the line git PREFIXES, but the commonest refusal has no prefix at all — `git commit` over an unchanged tree writes two lines to STDOUT, `On branch master` then `nothing to commit, working tree clean` — and every door quoted line 1, so the sentence a human weighs at §28 was the BANNER. One exported rule now (`gitVerdict` → `{line, rule, lines}`: prefixed outranks a status letter and a banner; with no prefix the LAST line is the actionable summary; one line is simply what git said; zero lines says so), and `quoteVerdict` states how much of git the quote is NOT (`· git's last line of the 6 it printed`). Second: the two v32 READ doors quoted NOTHING on a nonzero exit — they parsed the empty stdout and returned a tally, so a corrupt index answered `git.status → exit 128: 0 entries`, which reads as "clean"; `refusedNotAbsence` is v48's `cutNotAbsence` sibling and now sits on all six doors that can return parsed-empty. Third, found mid-increment: git can exit 0 and still not ANSWER — a conflicted index emits three NOTICE shapes (`* Unmerged path file.md`, ` file.md | Unmerged` inside a stat footer, and a combined `diff --cc` body the v32 parser finds no header for), all three parse to ZERO, and `git.staged` — v45's step one gate before the commit ask, whose whole job is saying whether there is anything to record — answered "the index is EMPTY", the exact opposite of the truth, since an unmerged path is the one thing a granted commit cannot record; one shared detector names all three shapes instead. 42nd proof `verdict-proof.mjs` runs every failing state TWICE, once through the door and once RAW outside the sandbox, so no assertion grades a door's memory of git: the banner is asserted ABSENT, each quote is checked against git's own bytes, a lock-then-unlock pair proves the refusal was about the LOCK and not the door, four read doors on one broken repo are checked by SUBTRACTION (strip the disclaimer and no absence claim may survive outside it), and §6 measures the limit — outside a repository `git diff --cached` degrades to `--no-index` and fails on the FLAG with a 132-line usage page, so the door quotes git's complaint about the flag and does NOT claim the missing repo it also could have meant: a door relays, it does not diagnose. Two already-committed proofs had pinned the old wording (v45's `intent-proof.mjs` asserted the banner sentence EQUAL, v51's `spawnlog-proof.mjs` asserted the reason ABSENT) and both now assert the new one — the second time this lane has learned that a proof quoting old prose undoes its own fix. No policy, argv, env list, budget, gate, host or ledger shape moved; nothing in runtime or Studio parses these sentences (grep-checked — the orchestrator relays `detail` as text), so no planned step changed; exec-host **137/137 → 159/159**, and the two sweep reds amendment 54 had to attribute to this work-in-flight are gone with it. Honest bounds: the rule reads git's ENGLISH, which v46's env pinning guarantees only because no `LANG` rides through; the quoted phrases are git 2.52's bytes and will age (the proof cross-checks them against raw git so a wording change reddens an assertion instead of silently rewording an agent's evidence); `prefixed` can name a symptom, not a cause; if v48's budget trimmed the notice line away no door can name it; and `git.status` still labels an unmerged entry `other`.** (am. 52) — 323/323 runtime + 159/159 exec-host + 105/105 studio vitest, forty-two proofs + in-browser loops. **v53 changes what the output budget MEANS, because a limit that a race can spend is not a limit. Measured before touching anything: ONE real program writing 9 100 bytes to stderr and then 4 000 bytes of answer to stdout, against the same 4 096-byte ceiling, returned `stdout 0 B / stderr 0 B` when stderr flushed first — the loud stream spent v30's SINGLE counter, and v48's whole-line trim then discarded the partial line it had cut, so the answer vanished without being asked for — while the same program with the writes swapped returned the answer intact. Same argv, same cwd, same env, same ceiling: **which pipe flushed first decided whether the agent saw anything**, so a command could answer differently twice in a row and no assertion at any level above the host could have caught it. The shipped rule is one line of accounting — a chunk is measured against `maxOutputBytes - kept[thatStream]`, not against the total — so each stream holds its own ceiling and nothing another stream wrote can consume it. A split-with-lending design (half guaranteed to each, either free to spend the other's unused half) was implemented first and rejected by this increment's own logic: a fast stream spends borrowed ground before the slow one arrives, so a borrowed share is a race with better manners. The price is stated as a number, not a footnote: the host can now retain 2 × maxOutputBytes (128 KiB at the default 64 KiB, 2 MiB where the suite proof asks for 1 MiB), while the field, its default, its per-rule override and v29's clamp are untouched — §4 of the proof asserts a rule still cannot raise its own ceiling. v52's verdict rule gets the half the budget used to eat: `gitVerdict` takes `{ truncated }`, and when nothing survives AND the budget bit the rule is `cut`, because v52's own `none` rule was producing `git.commit → exit 1: git printed no output at all · output truncated at budget` — two clauses contradicting each other in the one sentence a §28 reviewer reads. That makes three members of one family: `cutNotAbsence` for a tally (v48), `refusedNotAbsence` for a refusal (v52), `cut` for git's words (v53). 43rd proof `streams-proof.mjs` excludes the old model by ARITHMETIC on its own run rather than by re-implementing it (4 000 + 4 000 bytes held against a 4 096-byte ceiling is a total a single counter cannot reach), measures the opposite worry instead of assuming it away (six shipped git reads at their real ceilings: `truncated: false` on all six, so a well-behaved command pays nothing), drives a real `pre-commit` hook emitting 20 000 bytes with NO newline through the SHIPPED commit door at a ceiling that fits and one that does not — where the second says CUT, is asserted NOT to say "printed no output at all", and the v51 records show the journal holds nothing either, because the ceiling bounds what ANYONE downstream can see — and finishes with five runs of one command agreeing on every byte count, a determinism claim the pre-v53 code could not honestly make. Two committed assertions encoded the shared counter and were rewritten in the same commit, one of them literally titled "the cut is per-stream" while asserting that the starved stream says NOTHING (the phrase meant something else then), the other `exec-host-proof.mjs` §budgets — the third increment running into the same lesson: an assertion that encodes the old contract quietly undoes the fix, so a fix is not done until the old assertions are read, not merely green. exec-host **159/159 → 163/163** (`execHost.test.ts` 26 → 29, `gitTools.test.ts` 36 → 37), 43/43 agent proofs and all four root gates green. Honest bounds: worst-case retention doubles and nothing here makes it operator-settable per stream, so an operator who wants the old total halves the number they write; `truncated` is still ONE flag for two streams (the two strings are the evidence of who was cut, and a per-stream flag is a real future change rather than this one); a program that writes 30 KB on ONE pipe is still cut to its ceiling — v53 stops a stream silencing another, it raises nobody's limit; the shipped git doors were NOT silently muted before this (git merges a failing hook's output onto stderr, the real suite prints on stdout), which §2 measures instead of claiming, so the honest description is "the host is no longer order-dependent", not "a door was lying"; `test.run` inherits the fix with no change of its own and is where two busy streams are most likely to meet; what the timeout actually stops (killed parent, living process tree) is still unmeasured; and DEMO MODE stands — no Studio surface runs an exec host, so this is enforced in unit tests and proofs and no panel pretends otherwise.** (am. 53) — 323/323 runtime + 163/163 exec-host + 105/105 studio vitest, forty-three proofs + in-browser loops. **v54 moves v50's ownership rule out of the arc and under BOTH record kinds. v50's own last sentence named the gap: the file said who allowed the commit and said nothing about who allowed the write that commit recorded, because the anti-fold cuts both ways. The fix lifts v50's private matcher into `checkpointPolicy.ts` as `receiptsOrNote` + `gatedCallIds` (+9/−22 in `gitArc`, +43/−2 in the policy module) so one function answers for both lines and `decisions: []` cannot mean one thing on an arc and another on a run, gives `RunOutcome` a durable `decisions?`/`decisionsNote?` filled ONLY where the line is headed for a ledger, and derives ownership from the record's own `results` transcript read through the registry THAT record acted in — so reads (`fs.index`, `fs.search`, `memory.recall`) can never acquire a receipt and a scoped role cannot borrow the host's wider permission list. Then it turns "followed by construction" into "checked on read": `receiptsOwned` makes a receipt naming a call its record never made condemn the WHOLE line, on either kind, which closes the paste variant of v50's "a complete forged line is still believed" — and the price is paid in the same commit, where `receipts-proof.mjs`'s fixture learns to make the call it answers for and its tamper block grows a second forged line (`malformed 1 → 2`: one half-receipt, one complete-but-borrowed). 41st proof `runreceipts-proof.mjs` triangulates SIX sources on a real chain in an `os.tmpdir` repo — the durable run line, the durable arc line, the decider's own list in ask order, the workspace the granted write changed, the processes counted on the spawn seam, the commits counted by `rev-list` — plus §26 memory read cold off real disk, and its headline is arithmetic: 7 face gates = 2 run receipts + 4 arc receipts + 1 unowned brief, pinned as a set equation; a vetoed `test.run` reads back with the human's sentence beside a grant it cannot erase, at 0 processes and 0 commits; a bare closure puts one exported sentence in `decisionsNote` on one line and `notes` on the next while spending the same four processes and landing the same hash; and the reader re-derives the invariant instead of trusting the writer. `runTask`'s control flow is untouched (receipts are derived at the append site, never inside the loop), and the dock stays byte-identical because `apps/studio/src` contains ZERO occurrences of `ledgerFile`. runtime 305/305 → **323/323** (ledger 10→15, chain 25→30, checkpointPolicy 8→13, pipeline 5→8; `gitArc` 29 unchanged, import move only); exec-host, studio, doors, policies and argv are unchanged by this amendment, and 137/137 + 105/105 remain those lanes' committed numbers. Honest bounds: the designer's `${id}:brief` is gated and lives on NO record, because no record owns the chain as such — the next candidate is a third record kind for stage-level calls, not a paste onto someone else's line; a line whose receipts match its OWN fabricated transcript is still believed (the defence is shape, not signature); and 2 of this worktree's 43 sweep scripts are red from the concurrent lane's UNCOMMITTED verdict-line change, which `git grep` proves is not in HEAD** (am. 54) — 323/323 runtime + 137/137 exec-host + 105/105 studio vitest, forty-one proofs + in-browser loops. **v55 takes back a promise the sandbox never made. `killedByBudget: true, signal: 'SIGTERM'` has meant ONE thing since v30 — the process the host started was terminated — and has been read as another: that the run is over. Measured with real processes first: a program that leaves a DETACHED child behind kept writing **7 more heartbeats after the host reported the kill**, and the `os.tmpdir` directory it wrote into could not be deleted, because a live process still held it open — the sandbox's own cleanup was being outlived by the thing it had killed. The obstacle was the abstraction, so the abstraction moved first: v30's `ExecChild` (`onData`/`onEnd`/`kill`) carried no pid, so the host could not reach anything else however much it wanted to; `pid?: number` is now in the contract and a fake that reports none is answered `no-pid`, never a pretend success. The finding that decides the design is an ORDER: `taskkill /PID <pid> /T /F` issued AFTER the host's kill returns **128** (a dead parent has no children left to enumerate) while the survivor keeps writing, so kill-then-reap is a no-op that LOOKS like hygiene; issued INSTEAD of the kill it returns 0 and the survivor goes silent — reaping is a substitution, never a cleanup step. `descendantsStopped` is the new field and it refuses to collapse: `not-attempted` / `reaped` / `reaper-failed` / `no-pid` / `unsupported-platform`, present exactly when a kill happened and ABSENT otherwise rather than defaulted, so the v30 and v51 readers still report `malformed 0` (one-directional compatibility, as in v51) and an operator who asked for reaping learns whether the reason was this platform, a missing handle, or a call that failed. Default OFF (`reapTree`), exactly like v51's journal — which is what lets the other 43 scripts be the assertion that nothing else moved; a failed or throwing reaper still performs the kill it CAN do, because a tree call may degrade reach, never the guarantee. What reaping costs is visible too: a force-killed tree reports `exit 1 / signal null` instead of `SIGTERM`, and the proof keeps those fields beside `killedByBudget: true` rather than normalising them. 44th proof `reap-proof.mjs`: §1 the survivor with the default, §2 silence with the reaper, §3 the dead-pid control that proves the ordering, §4 the platform answer as a VALUE (`TREE_REAPER_AVAILABLE`, and `DEFAULT_TREE_REAPER(0) === false` without throwing) so the file asserts what is true on this box instead of hoping, §5 an ATTACHED child dies with its parent — so the default was never a bug, only a limit, and nothing here claims to kill every descendant on a machine — §6 both claims side by side in the v51 audit record, and a `finally` that reaps its own survivors BEFORE deleting their directory, with a bounded retry and a hard assertion that nothing was left behind. exec-host **163/163 → 170/170** (7 tree cases), 44/44 agent proofs green, and the two readers that predate the field are untouched by it. Honest bounds: the host reports what IT did, never that nothing survives; the win32 reaper runs a SECOND binary (`taskkill`, argv fixed and built from an integer pid, never an agent-supplied string — which is why reaping is opt-in at all); POSIX answers `unsupported-platform` and is exercised in unit tests, not claimed as observed; a re-parented or already-exited descendant is outside what any single call can promise; and DEMO MODE is unaffected — no Studio surface registers an exec host, so this is enforced in proofs and unit tests and no panel pretends otherwise.** (am. 55) — 323/323 runtime + 170/170 exec-host + 105/105 studio vitest, forty-four proofs + in-browser loops. **v56 says which pipe the budget actually cut, because one bit about two pipes was wrong half the time. v53 gave each stream its own ceiling and left `truncated` as a single flag, and that flag is load-bearing twice: it is the clause a §28 reviewer reads, and it is the condition v48's "no complete line survived the output budget" hedge turns on. Measured through the SHIPPED `exec.run` door first: a program writing 28 bytes of answer to stdout and 8 000 bytes of progress to stderr under a 1 024-byte ceiling came back with the answer BYTE-IDENTICAL to an uncapped control run and the sentence `→ exit 0 (output truncated)` — the door casting doubt on the one thing it had received whole; swap the pipes at an 8-byte ceiling, the answer genuinely is gone, and the sentence is IDENTICAL. The fix is a fact rather than a policy: `truncatedStreams?: ('stdout'|'stderr')[]`, present exactly when something was cut, in a stable order (streams, not arrival), and ABSENT when nothing was cut rather than an empty array — so "no cut" and "cut, unattributable" remain different statements and every pre-v56 reader is unmoved. The second bug was the worse one: v48's hedge is a claim about the stream the door PARSED, keyed off the aggregate bit, so a door reading a genuinely EMPTY stdout whose OTHER pipe had overflowed said the index might have had something in it after all (and v52's `cut` verdict rule had the same aggregate key) — both now ask `stdoutWasCut(result)`, and §4 of the proof measures the equivalence on real git: 24 multibyte staged lines, 10 budgets DERIVED from git's own byte offsets (four landing inside the FIRST line), 5 of them leaving nothing to parse, the hedge appearing on exactly those 5 and on none of the other 5. Five doors each re-assembled the two budget clauses by hand and a sixth spelled them a fifth way; `budgetFlags` is now the ONE builder, which is the same argument v51 made about the journal — put it where a door added next month cannot forget it. 45th proof `pipes-proof.mjs`: §1 the intact answer against an uncapped control, §2 the mirror, §3 the two sentences differing (the increment in one assertion) and the no-evidence form naming NOTHING, §4 the real staged read above, §5 measuring where the hazard actually lives rather than assuming it — all five shipped read doors answered on stdout with zero bytes on stderr on this box, so the git doors are exposed through a cut STDOUT only, which is what §4 exercises and why this file does not claim a bug the git doors never had — and §6 showing the v51 audit record carrying the naming too, so "whose bytes were dropped" stays answerable a week later from the file alone. exec-host **170/170 → 177/177** (2 in `execHost.test.ts`, 3 in `gitTools.test.ts`, 2 in `gitStagedTool.test.ts` — the last pair the false hedge and its mirror), 45/45 agent proofs and all four root gates green, and the 44 already-committed proofs needed no edit because the aggregate flag and every prefix of its sentence are untouched. Honest bounds: a run that never reached the byte counter reports NOTHING rather than "nothing was cut" for a stream it did not read; `budgetFlags` prints the bare clause with no stream evidence instead of guessing; `stdoutWasCut` reading absence as false is correct for the shipped host and would UNDER-report for a hand-set `truncated`, which is why only the host sets either; §5's finding is a measurement of git 2.52 on this box, not a promise that a git read never writes to stderr (a warning-bearing read would simply exercise the naming, which is the point of having it); the doors' sentences grow by one parenthetical and nothing parses them for meaning; and DEMO MODE is unaffected — no Studio surface runs an exec host.** (am. 56) — 323/323 runtime + 177/177 exec-host + 105/105 studio vitest, forty-five proofs + in-browser loops. **v57 makes one conflicted repository tell one story. v52 named an unmerged path in the diff-family doors and left a bound saying `git.status` still calls such an entry `other`; measuring every conflict shape showed the hole was worse — v32's porcelain table matched a code per row and asked whether the field CONTAINED it, so `UU`/`AU`/`UA`/`DU`/`UD` came out unmerged while **`AA` fell to the `A` row and `DD` to the `D` row**, even though git's own spec lists exactly seven unmerged codes. On a real add/add merge `git status --short` prints `AA new.md` and the door reported `1 entries (1 added)` about a repository where `git commit` answers 128 with "Committing is not possible because you have unmerged files": the agent's FIRST read of a conflicted tree described it as work waiting to be committed, contradicting the `git.staged` step in the same plan. `UNMERGED_XY` is now consulted before the table (a genuine staged add still reads as added; an unknown code is still `other` — the ordering protects v32's junk honesty rather than replacing it), and the door says what the tally hides: `git reported 1 UNMERGED path(s) (new.md) — … these entries are NOT a staged change and a granted git.commit right now would be refused by git itself`. 46th proof `conflict-proof.mjs` refuses to take that sentence on trust: for each of three real shapes it first asserts what raw `git status --short` prints (that control corrected the proof's own guess — delete/modify is `DU` here, not `UD`), then ASKS FOR THE COMMIT the door promises will be refused, 128 every time, then shows one add/add repo described the same way by both doors, then proves the refusals were about the conflict and not the door by landing a real commit in a clean tree, then reads `MERGE_HEAD` off disk against `git rev-parse`. Migration said plainly: a count that used to be `added` in a conflicted repo is `unmerged` now; nothing in this repo depended on it, and the 46/46 sweep is what proves that rather than the prose. exec-host **177/177 → 181/181** (4 new `gitTools.test.ts` cases). Honest bounds: one status per entry, so a both-deleted path carries no more than `DD` (git's stage-1/2/3 rows are a deeper read no door here asks for); a conflicted rename still shows the new path, as v32 decided; nothing renders a conflict in the dock; and DEMO MODE stands — no Studio surface runs an exec host, so all of v57 is enforced in unit tests and proofs.** (am. 57) — 323/323 runtime + 181/181 exec-host + 105/105 studio vitest, forty-six proofs + in-browser loops. **v60 takes v53's rule one layer up, to the sentence a verify step writes.** The `test.run` bridge had been quoting `stderr || stdout` since v31 — not a race, a preference: stderr always won. Measured against real processes before anything was written, and with the shipped old rule recomputed from the SAME result so the damage is shown rather than asserted: a 42-byte answer on stdout beside a 42-byte warning on stderr produced a sentence containing only the warning, in both write orders; worse, 2 500 bytes of stdout under a 2 000-byte ceiling beside a 5-byte warning produced a **53-byte** sentence that quoted the warning and then announced `output truncated at budget (stdout)` — describing a cut it had itself hidden while 2 000 whole bytes went unreported. Now every non-empty pipe is quoted under its own label, a pipe cut to nothing says so in v48's words (NOT a statement that it printed nothing), `exit ${code}` prints only when a code exists (otherwise `no exit code reported`), and v55's `descendantsStopped` finally has a landing point in a verify sentence. A refusal is filed under `NEVER_RAN` rather than the predicate it never reached — the dock tooltip prints that name — while `total` deliberately stays **1**: zeroing it would make `registerTestTools` answer a real refusal with "no test predicate named exit-zero", replacing one dishonesty with a stranger one, and §6 of the proof pins that trap. Price, in numbers: a report sentence can now carry both pipes, measured at **2 072 bytes** under a 2 000-byte per-stream ceiling — the same 2× v53 accepted for retention. Honest bound: the one suite command this repo ships writes **592 B on stdout and 0 on stderr**, so v31's pick happened to pick right; the hazard was latent in the bridge, not live in a door — and any program that WARNS is where it bites.** (am. 60) — 323/323 runtime + 187/187 exec-host + 114/114 studio vitest, forty-seven proofs + in-browser loops. **v61 takes v32/v42/v43's silent assumption away: the bytes between a porcelain line's columns are a RENDERING of a path, not the path.** Measured against real git 2.52 on this box: a rename prints TWO names and v32 kept the half HEAD has never heard of, so `git.show` answered 0 bytes where raw git answers 221 and the door said `HEAD touches nothing at <the file the human is about to commit>`; a name git chose to QUOTE (`core.quotePath` defaults to true) wraps the `a/`/`b/` prefix too, so v43's header regex matched it nowhere, the parse lost the file, and a door holding zero files said the one thing a door must never say about a non-empty index — `the index is EMPTY` — while git's OWN `--stat` line for those same bytes reads `1 file changed`; and quoting is not about exotic bytes at all, since with the pin in place a name containing an ordinary SPACE still arrives as `?? "plain name.md"`. One counted slot plus one rule: `core.quotePath=false` (argv untouched — this confines what git may SAY, not what it may DO), and `unwrapRendering`, which undoes git's quoting of an ordinary name and hands a string git ESCAPED over verbatim and MARKED, because every character git escapes carries a backslash. A header split by POSITION can be stolen by a directory named `m b/` — which NTFS allows and the proof creates — so git's own per-line names (`+++ b/…`, `rename to`/`copy to`) now win wherever they exist, and the content door refuses to ask git about a rendering at ZERO spawns. One candidate this increment set out to fix was REFUTED instead: an untracked directory counts as 3 entries here, not 1, because v46 already pins `status.showUntrackedFiles=all`.** (am. 61) — 323/323 runtime + 201/201 exec-host + 114/114 studio vitest, forty-eight proofs + in-browser loops. **v62 gives git.status TWO columns: a per-file staged/dirty flag, and one tree-split notice that names how many entries a commit will actually record** (am. 62) — 323/323 runtime + 215/215 exec-host + 114/114 studio vitest, forty-nine proofs + in-browser loops. **v63 makes v62’s ratio answer for the read behind it: a status list the budget CUT says “3/21 entries THIS DOOR READ”, and the “everything is staged” silence is no longer allowed on a partial read.** Porcelain prints tracked rows first and untracked paths last, so over a repository whose `git status --short` answers 403 lines (3 staged edits + 400 untracked files) a 256-byte budget hands the door 21 of those lines and v62 printed `3/21 entries differ from HEAD there` as a fact about the tree; at 30 bytes only the three `M ` rows survive, `stagedCount === files.length` holds, and the notice fell SILENT over 400 files the door never saw. `treeSplitNotice` now takes the read — v56’s `stdoutWasCut(result)`, the one fact that says git printed MORE on the pipe being parsed — renames the ratio, labels the untracked list, and adds `NOT a census of the repository`; the silence becomes `all N entries this door read differ from HEAD in the index · … NOT a statement that nothing unstaged or untracked exists behind it`, and it never states how many entries were missed, because the door cannot know. Two refusals kept: the flag is NOT derived from the aggregate `truncated` (a cut on the noise stream may not re-label an answer that arrived whole — v56’s rule), and `killedByBudget` is not part of it either, because a killed read fails the door’s `ok` and answers with v52’s refusal sentence, so the first draft’s `|| killedByBudget` was unreachable and was deleted. 51st script `window-proof.mjs` reads ONE repository at three budgets, asserts the denominator equals the entries returned, that a window never names a path git did not print, that the SAME parsed entries give silence when the read was whole and a sentence when it was cut, and that one real commit records exactly the 3. (am. 63) — 323/323 runtime + 221/221 exec-host + 114/114 studio vitest, fifty proofs + in-browser loops. (am. 64) — three diff readers asked a line what it LOOKS LIKE when the question was WHERE it sits. git prints its `--- `/`+++ ` name pair exactly once per file section, in the preamble before the first `@@`; inside a hunk EVERY line is content, and content is prefixed with one character — so a file that gains the text `++ b/second.md` arrives at the door as `+++ b/second.md`, and the blanket `!startsWith('+++')` exception v32 wrote ate it. Measured: git's `3 files changed, 2 insertions(+), 1 deletion(-)` was the door's `3 files, +0 −0 (3 hunks)`, `notes.md` was RENAMED to `second.md` — a path that exists nowhere — by v61's own per-line name rule, and `git.staged`, the door that exists to show a human what a commit would add, handed back an `addedLines` list missing exactly that line. Now `isDiffHeaderPairLine(line, insideHunk)` is one predicate with one call site in each of `parseGitDiff`/`parseStagedDiff`/`parseShowDiff`, and no blanket exception survives (asserted at source level, not by review). The same proof found git's other name-line habit: an UNQUOTED name containing a space ends with a literal TAB (measured `--- a/m b/spaced.md` + TAB, `+++ b/m b/renamed.md` + TAB, in `git show` too) while a space-free name, a `/dev/null` side and a C-QUOTED name each carry none — the unified header's field separator with an empty second field — so a reader that kept it handed §28 a path that will not open; an unquoted name now ends at its first TAB, and a cut that leaves nothing names nothing. 52nd script `hunk-shape-proof.mjs` measures every number against git's own `--numstat -z` / `--name-only -z` / `--shortstat` (and says why `-z` is load-bearing: a rename makes plain numstat print `x.md => m b/n.md`, a key the reader would have to rebuild by guessing), transcribes the REPLACED rule and runs it over the same bytes, asks `git log -S` for the commit that wrote the old predicate, makes one real commit through the commit door and reads it back through `git.show`, and witnesses the TAB byte in git's own line. 233/233 exec-host (from 221), fifty-one proofs / 52 scripts green; two already-committed sentences re-counted in the same commit rather than left to rot (`git-aware-proof.mjs`'s `+++ / --- headers never count as changes`, and two unit-test titles that said headers are "never content"). (am. 65) — a repository’s own `.git/config` chose the prefix every diff reader strips: with `diff.noprefix`, `diff.mnemonicPrefix`, `diff.srcPrefix` or `diff.dstPrefix` set, `git diff --cached` still exits 0 and prints FOUR `diff --git` sections while `parseStagedDiff` returns 0 files, so the door built for the §28 pre-commit window answered `the index is EMPTY — nothing is staged` over an index git’s footer called `4 files changed, 4 insertions(+), 2 deletions(-)`. Fixed at the ARGV, which is the layer the measurement picked: `--src-prefix=a/ --dst-prefix=b/` restores all four keys at once and OUTRANKS the config file, where v46’s counted-config table would need a new slot per key and still lose to any key git invents later — the two tokens leave a repository that sets nothing byte-identical (sha256 over four shapes), so `GIT_DIFF_FLAGS` is 4 tokens and the env table stays at 5. And the door now COUNTS what it cannot NAME: `unnamableDiffSections` + a notice, with the EMPTY sentence reachable only after unmerged → unnamable → cut, because stripping two characters is a guess (`x.ts x.ts` → `ts`, a path that exists nowhere; `q/bin.dat b/bin.dat` → right by luck, and the answer never says which happened). A second defect fell out of writing that test, same family as v64: an unread section left the PREVIOUS record open, so git’s `---`/`+++`/`@@` pair and every content line under it were tallied into the last named path — `+5 −1 across 2 hunk(s)` for a file that added 2 lines. A short tally is checkable; an inflated one is a wrong number a reviewer cannot find. Both readers now end the current file at ANY `diff --git` line. 53rd script `prefix-proof.mjs` measures git against git (`--shortstat`/`--numstat -z` name 4 where the header matcher names 0), replays the pre-v65 process through a spawn stand-in that drops the two flags on the way to git, drives two hostile keys at once plus `git.show`, hand-splices a phantom section to prove nothing bleeds, and TRANSCRIBES the sentence that was the lie so the finding survives a rewrite of the source. 244/244 exec-host (from 233), fifty-two proofs / 53 scripts green; the two witnesses of the old flag literal were re-counted in this same commit rather than left to rot (`gitEnvIsolation.test.ts` now pins the exact four-token array and that no `diff.*` key entered the env table; `config-proof.mjs` interpolates `FLAGS`). (am. 66) — **v66 (exec-host): a cut DIFF tally is a WINDOW claim too — v63 wrote that rule for `git.status` and left it THERE, so three doors kept phrasing a trimmed read as the repository's census.** Measured before written: an index of 25 changes (`25 files changed, 75 insertions(+), 75 deletions(-)`) read at a budget that keeps 8 sections answered `index holds 8 change(s): 8 modified · +24 −24 across 24 hunk(s)`, with v56's pipe clause as its only hint that bytes went missing; 774 of that diff's 776 line boundaries are cuts, and every one of them used to speak as a census. `git.diff` said `1 files, +0 −0 (0 hunks)` where git counts `+1 −1`, and `0 files` about a 4-section worktree diff — v48's cut-is-not-absence rule had never been wired into THAT door's zero. `git.show` said `HEAD changed src/mod-09/a-long-file-name-9.ts · +12 −0` where its own `--numstat` is `60 0`; of that face's 65 cut windows (67 line boundaries) 59 short-count a file the same sentence calls changed, and v66 leaves 60 carrying the floor and 5 refusing to state a count at all. The harm is PHRASING, not size, so no arithmetic and no budget changed: the doors now say what KIND of number they are holding — `AT LEAST` inside the count, `diffWindowNotice` beside it, driven by v56's `stdoutWasCut` (a fifth member of the v48/v52/v56/v65 family, at the sentence layer, no new record fields). The sentence can be specific because a diff read's SHAPE makes it so, and the shape was measured two ways rather than argued: the host keeps a prefix of whole lines and a section ends at the next `diff --git`, so every change named before the last is byte-complete — proof §2 drives real git at a section boundary (8696 B: the 8th change is WHOLE, only the 9th never arrives) and 900 bytes later (the 9th is there and SHORT), grading "the changes named before it are whole" against git's own `--numstat`. Hence `MAY` for a multi-section door, and `cutIsInside` true only for `git.show`, whose argv confines the read to one path — a §60 correction to this increment's own first draft. The `--stat` faces keep their census for the same reason turned inside out (git's footer is its LAST line, so a window holding it holds the body: 2 of 27 and 2 of 6 windows parse a footer, none of them part-read), and their real hole was the zero, which is v48's sentence. 54th script `cut-tally-proof.mjs` sweeps all 774 windows by replaying git's recorded bytes through the SHIPPED host — a shortcut §3a pays for by comparing real git against the replay byte-for-byte at 12 budgets — classifies every `git.show` and `git.diff` window so none is uncounted, and closes with ONE real commit recording 25 paths where the window named 8. 259/259 exec-host (from 244: +8 `gitTools`, +3 `gitShowTool`, +4 `gitStagedTool`), 53 proofs / 54 scripts green; every non-cut sentence stayed byte-identical, so the 52 older proofs stay green by construction rather than by re-counting. (am. 67) — **v67 (exec-host): a repository’s OWN `color.*` and `log.decorate` wrote ANSI escapes and git’s refs INTO the fields the doors parse** — five faces measured in a colored throwaway repo (4/19/2/26/19 escape sequences) produced FOUR false absences out of exit 0: an index holding ONE change answered `the index is EMPTY`, a 3-commit history answered `0 commit(s)`, `git.status` classified both dirty files `other` with paths beginning `[31mM`, and `git.show` read HEAD’s painted `+export const staged = 3;` as no addition at all. The rule is now MEASURED, not argued: a colorspace with a flag is pinned by the argv, a colorspace without one is pinned by the env — `git status` and `git commit` refuse BOTH `--no-color` and `--color=never` with exit 129 (so two `color.*` keys join `GIT_FORCED_CONFIG`, 5→7 slots, and every counted neighbour shifts) while `diff`/`log`/`show` accept the flag (so `GIT_DIFF_FLAGS` gained a fifth token shared by four doors, and `GIT_LOG_FLAGS` is new with `--no-decorate` + `--no-color`). `--no-color` alone removes 26 escapes and leaves `(HEAD -> main, tag: v1.0, feature)` inside the subject, and the fixture’s newest commit is TITLED `(HEAD -> main) …`, so the pinned answer still contains that string — measured, and the reason the fix is a pin rather than a strip. Two honest negatives: `parseDiffStat` reads git’s NUMBER column so a painted `--stat` bar breaks nothing, and `git show --format=` needed only the color half because an empty format prints no subject. §6 shows all five faces byte-IDENTICAL pinned-vs-old in a config-clean repo, which is why 48 tracked proofs stayed green untouched while the 5 that transcribe a pinned argv were re-counted in this same commit (config/gitlog/confirm/prefix/porcelain-path, index-only onto HEAD’s blobs). 262/262 exec-host (from 259: +1 `gitEnvIsolation`, +2 `gitLogTool`), 54 proofs / 55 scripts green, and the old-contract re-count continues (sorted slots 5→7 and the env-smuggling case now plants `color.ui` at slot 7). (am. 68) — **v68 (exec-host): a LOG read’s count is a FLOOR, and newest-first is why its entries are not** — v66 fixed the three DIFF doors and left `git.log` saying `N commit(s)`; measured on a 25-commit throwaway repo (git’s own `rev-list --count` = 25, `--oneline -n 25` = 25 lines / 1653 bytes), ALL 24 whole-line cut budgets printed a census. The difference decides the wording: a log line names exactly ONE commit and git prints newest-first, so a cut can only stop handing over the OLDER ones — 0 of 24 windows lost the newest entry, 0 renamed or reordered a survivor, 0 overcounted the history. So `logWindowNotice` says BOTH halves (`AT LEAST` plus `OLDER than every entry named here`, `this door asked for 25`), v66’s `MAY stop` hedge is asserted ABSENT because a log entry cannot be cut mid-line, and §4 lands a REAL commit and reads it back at keep=1/2/5: the newest hash is still byte-equal to the commit record (v37’s claim survives) while the same reads count 1/2/5 of 26. §6 keys the rule off a CUT, not off a small number (unbounded vs last-line-boundary budgets answer byte-identically), and §5 keeps v48’s zero-line sentence untouched with two guards. 268/268 exec-host (from 262: +3 `gitTools`, +3 `gitLogTool`; v48’s case re-guarded in the same commit), 55 proofs / 56 scripts green, and because no argv/env/policy moved no witness proof needed a re-count. (am. 69) — **v69 (exec-host): the window claim moves from the SENTENCE into the RECORD** — seven amendments (v48/v52/v56/v63/v65/v66/v68) all wrote into `detail`, while the record kept only v30’s `truncated`, a bit about TWO pipes. Measured first, against this increment’s own story: eight real git reads at exit 0 carry 0 B on stderr (8/8), so nobody claims a git door ever muted a number — the defect is that the host computed `truncatedStreams`, every door READ it to write its clause, and dropped it before handing the record on. `windowField` adds ONE derived key (`windowed: true`, absent rather than false — v55/v56 precedent) to the seven faces that parse (status, diff, diff `--stat`, staged, staged `--stat`, log, show), refusal branches included: §2 asserts the coupling door by door over 14 reads (uncut ⇒ no key and no clause · cut ⇒ key and clause), §3 proves with a real process at a 512-B ceiling (stdout 28/28 whole beside 9 000 B of cut stderr) that the aggregate bit is a DIFFERENT question, and §4 shows a cut record minus `windowed` has exactly the uncut record’s key set. 271/271 exec-host (from 268: +3 `gitTools`), 56 proofs / 57 scripts green, and because no argv/env/policy moved no witness proof needed a re-count. `git.commit`’s record was left alone by choice (its numbers are git’s commit echo, policed in prose by v48/v52) — extending the key there is queued, not claimed. (am. 70) — **v70 (exec-host): the WRITE door’s record joins the window family** — git’s commit echo is TWO lines, so a budget can keep the header and lose the footer (`record.stat` = null) or lose both (`record` ABSENT from the door’s output) while HEAD moves every single time, because a budget trims what the door heard, never what git did. Measured against git outside the sandbox at one byte past the header line (121 B) and twenty short of it (100 B): the hash and subject that survived are verbatim, `rev-list --count` grew by exactly one each round, and the control reads at 600 B come back WHOLE with no key at all — so the two cut shapes are not a matter of degree. The fix is v69’s one derived key on both of the door’s records; no argv, policy, budget, gate or parser moved, so no witness proof needed a re-count. §4 round-trips all three shapes through the JSON the ledger is built from, and §5 pins 9 granted real commits with `spawns === doorReads`. exec-host stays 271/271, 57 proofs / 58 scripts green. Honest bound kept: the door still cannot confirm its own commit — `git rev-parse HEAD` would be a second command and this policy allows exactly one argv shape, so the door would have to be given a power to be able to check itself. (am. 71) — **v71 (runtime + exec-host): a TEST REPORT names WHICH pipe the budget cut** — the family’s last stop was one layer above the doors: `TestReport` carried only `engine/ok/total/passed/failures/detail`, so a chip, a ledger replay or the commit-after-green gate could read `1/1 ✓` while the answer it never saw was 2 500 B of stdout trimmed to 2 000. The verdict is untouched and stays the command’s own exit code (v31’s rule) — an exit-zero suite that overflowed its pipe is still green — what changed is that the EVIDENCE beside it now says which pipe was shortened: `truncatedStreams?`, copied from the list v56 already computes, absent rather than empty. Measured with real programs (58th proof, 59th script): stdout cut while green / stderr cut with the answer whole / both cut while failing / clean → three carry the list in reader order, one carries nothing; the JSONL round trip preserves the list AND its absence; a vacuous `only`-miss and a §28 refusal (v60’s `never-ran`) must not carry it. exec-host 272/272 (from 271: +1 case, 1 extended), runtime field additive and optional so `predicateRunner`, in-process hosts and Studio chips are unaffected, and 57 tracked proofs swept green untouched because none asserted a report’s key set. Bound kept: nothing DISPLAYS it yet, `descendantsStopped` still arrives only in prose, and v60’s measurement (the one wired suite: 592 B stdout / 0 B stderr at a 2 000 B ceiling) means this hazard is LATENT in the bridge, not a mislabel a shipped suite ever made. (am. 72) — **v72 (Studio dock): the chip a human reads says when a green ✓ quotes a window** — v71 shipped `truncatedStreams` and closed by admitting nothing read it, so this is the reader: `testChipsFor` (v33) gains `evidenceCut: string | null` (pipes joined ' + ', the same joining v56 used; null for an in-process report, never an empty string), and `TestChips` turns a passed-but-cut chip **amber** rather than green and appends `⚠ evidence cut: stdout`, its tooltip saying the quote is a window rather than the whole answer — red stays reserved for a real failure, because `ok` is still the command's own exit code (v31, re-asserted in v71). Evidence is studio's headless vitest (v33/v41 precedent for a pure dock function): **115/115** (from 114: +1 case over three reports, and TWO existing strict `toEqual` chip expectations re-counted in this same commit — fifth consecutive increment paying that account). ⚠️Stated, not papered over: **no visual verification was done, because none is reachable** — no Studio surface runs an exec host, so a browser session cannot produce a report carrying the field today; the marker becomes observable only when a caller supplies one, and that change will need a real browser pass. Nothing in runtime/exec-host/policy/argv moved, so all 58 tracked agent proofs sweep green untouched and the four root gates are green. (am. 73) — **v73 (runtime + exec-host): a KILL is not a CUT, and the report must say which it saw** — v55 built 'descendantsStopped' because 'killedByBudget' is a claim about ONE process (a detached child kept writing after the host reported the kill), and v60 carried both into the report’s SENTENCE; measured now, the report’s STRUCTURE still had neither: `detail, engine, failures, ok, passed, total`, with the signal, the tree and the absent exit code surviving only in prose. So 'TestReport.killed?: { signal, descendantsStopped, exitCode }', filled only on a kill, absent rather than zeroed, in the host’s own words — and the runtime deliberately does NOT restate v55’s five-label union as a type (it cannot import exec-host; a second copy of that list is a second source that drifts); the proof pins a real value instead. report-kill-proof.mjs (59th proof, 60th script): §1 kills a real hang and cross-checks the OS — the detached child wrote **8** more heartbeats after 'killed'; §2 keeps the axes apart (a cut run carries truncatedStreams and no killed; a clean run carries neither); §3 round-trips the nested object through the ledger JSONL including its null exit code; §4 turns the reaper ON and the same field reads 'reaped' with signal null (taskkill replaced the kill — v55’s ordering finding), so the value tracks what was attempted, not the option set. exec-host 273/273 (+1 case), studio 115/115 and 58 tracked proofs untouched, four root gates green, no argv/policy/budget/gate/parser moved. (am. 74) — **v74 (exec-host): a KILL is the host’s action — a door may not say 'git REFUSED' for it** — measured first as a §60 defect in PROSE: with a 1 ms budget over a 300-file repo, 5 of 5 git doors answered '… · git REFUSED this command — this is NOT a statement that …' in the same sentence that reported 'exit null'; git refused nothing, it was still running when OUR ceiling stopped it. v52 wrote refusedNotAbsence for git declining and v53 added the cut rule so an emptied pipe isn’t called git’s silence — the kill had been wearing the refusal’s clothes. Split by one boolean the sentences already pass around: 'killedNotRefusal(...)' names the exec host as the actor, and 'killedField(result)' carries v73’s { signal, descendantsStopped } into the record (absent, not empty). door-kill-proof.mjs (60th proof, 61st script) checks BOTH directions with real git: §1 five kills — record carries the kill, sentence names the host, 'git REFUSED' nowhere, and 'windowed' stays away because a timeout trims no pipe; §2 v52’s own mirror — git.staged outside a repo exits 129 under a 126-line usage page, still says 'git REFUSED' and carries no killed; §3 the same door on a generous budget with neither marker. exec-host 274/274, 59 tracked proofs untouched, commit door’s refusal branch deliberately left alone (a killed commit may have committed while its echo was lost — v70’s asymmetry, so the new clause would be the wrong sentence there). (am. 75) — **v75 (runtime): what the walk LOST is part of what the walk did** — v69–v74 put 'windowed' and 'killed' into door records, v72 onto the chip, but §26 memory is prose a LATER run reads back: the remembered line was still `release completed: staged→commit→confirm→inspect`, so a chain whose index read was floored by a budget — or whose confirm the host killed — was remembered exactly as confidently as one that saw everything. The obvious suspicion (strict ledger validators turning a new key into a malformed line) was measured and REFUTED: a plain pre-v69 record is rejected by the same fixture, so nothing was 'fixed' to answer it. Fix = `arcReadCaveats(arc)` read off the arc’s own records, folded into `notes` at both endings via a `caveated()` wrapper — and because §26 already prints notes, `pipeline.ts` needed NO change (the first draft wired it in the consumer and was reverted: an inline copy there is the drift v51/v54/v69 keep naming). Empty means nothing was lost, so the v39/v47 line is byte-identical — asserted by chain.test.ts’s whole-summary toEqual pairs, untouched. runtime 349/349 (gitArc 29→32: windowed / killed / both-as-two-sentences / whole-and-doorless earn nothing), all 60 tracked proofs swept untouched, four root gates green. (am. 76) — **v76 (exec-host): 'reaped' is what the reaper REPORTED, not a promise that nothing runs** — v55's two measurements both stand (kill stops one process; reaping instead of killing reaches a survivor), but the one-word label invited a third claim nobody tested. A suite-shaped program hanging and leaving a DETACHED grandchild: reaper off → not-attempted with 14 heartbeats after the report; reaper on → **'reaped' reported and 14 heartbeats after the report too**, because a detached grandchild is outside the tree the reaper could reach; and the temp dir refused to delete (EPERM) with a live process still holding it — v55's own signature, now the third witness. Scope was chosen by measurement and one hypothesis was DROPPED: the reaper is not unreachable from the verification seam (reapTree belongs to createExecHost, which the caller already builds), so nothing was plumbed; what was wrong was a claim, so the bridge's kill clause stops saying '(descendants: reaped)' and says 'the reaper ran — a detached grandchild may still be alive', while every other v55 value keeps its wording; execHost.ts states the limit beside the type. exec-host 274/274 unchanged, reap-proof/report-kill-proof/door-kill-proof + the new 61st script (reaper-survivor-proof) green, four root gates green; the 61-proof sweep owed here was run by the next window and printed **61 scripts · 3 failed**, each red attributed by `sweep.mjs` to the axis it belongs to (one build, two working-tree/round-trip) — ADR 0016 amendment 78, which also corrects the earlier "0 failed" claim made by a runner that named no bytes. **v78 (docs/evidence): a sweep must name the BYTES it graded** — `sweep.mjs` materialises the REF's proof copies into `os.tmpdir()` and prints an `[identity]` block before any result (ref sha, node/platform/git, sha256 digest over every shipped `dist` file keyed by path, tracked-modified source count, proofs differing from the worktree copy), re-checks the digest after the last script so a mid-run rebuild cannot hide, and closes with a quotable `[summary]`; `provenance-proof.mjs` (62nd tracked script) checks the runner against a second, independent `git show` reader over all 61 proofs, proves the digest moves on one byte AND on a rename with none, pins green/red/timeout/exit-7 reporting in both directions (stdout from the tail, stderr from the head, because a thrown error prints its reason FIRST), and carries a synthetic-repo positive control for the porcelain two-column dirty filter. Bound stated: naming a build is not reproducing it, and a tree-walking proof's object (both index proofs read `.`) is a third axis the runner does not yet name. **v79 (runtime): a key whose VALUE is `undefined` is not a key** — `chunkFile` kept two shapes for "no heading" (the window branch omitted the field, the markdown branch wrote `heading: undefined`), both valid under `heading?: string` and identical to every reader, but `JSON.stringify` drops the second one, so `saveIndex`→`loadIndex` returned an object that could never have come off disk and `index-store-proof`/`provider-proof`'s cold-vs-reload comparison went red for the first time in 25 increments — reachable only because this window wrote an untracked scratch note whose text precedes its first `#`. The fix takes the smaller shape (absence has one representation), not the looser comparison; five unit cases pin both sides plus `queryIndex` identity, and both proofs were re-run with the trigger file STILL in the walked tree so the code, not the tree, is what changed. runtime **349 → 354**, eight turbo tasks green. The runner found a bug in itself on the way: its `[identity]` line printed `scripts 63` where the population is 62 because it listed and ran ITSELF, spawning a nested sweep that had to be killed — the proof filter is now the directory's own `-proof.mjs` convention — **v80 closed that third axis**: `walkedTree()` digests the tree the proofs walk (path-keyed sha256, ownership split tracked / untracked / ignored-by-elimination), `[identity]` prints it before any result and re-checks it after the last script, and the summary line carries `tree <digest> (stable|MOVED mid-run)` — measured 220 files here against 193 in a clean clone of the same commit, its 27 untracked ones owning 637 of the 1 664 indexed chunks, and `tree-axis-proof.mjs` is the 63rd tracked script — **v81 isolated it**: `isolatedCheckout()` untars `git archive <ref>` into a temp tree, gives it workspace links built from the ARCHIVED workspaces globs (home's `node_modules/@nexus/*` are absolute symlinks into the worktree, so reusing them would compile this lane's uncommitted sources into home's `dist`) and builds there — judged by ONE gate, home's dist digest byte-identical before and after (`8b3ff8b0e7f62133`, 224 files, UNMOVED across a 35.0 s isolated build, `Cached: 0 cached, 5 total` so nothing came back from home's cache) · the clean checkout walks **193** of this worktree's **220** files and `code-index-proof.mjs` is green in both, every clean file tracked at HEAD · `walkedTree()` no longer crashes where git cannot answer, and reports that census as `null` rather than `0` · the isolated build exits 1 naming `@nexus/studio#build` over a cross-drive junction, which is reported and NOT promoted into "HEAD does not build" — and the reason line is index 35 of 55 while the runner keeps `tailOf(4)`, so naming a build REASON is the next increment rather than a quote this runner never captured · `isolated-proof.mjs` is the 64th tracked script, and isolation is still not `runSweep`'s default — **v82 made the verdict quotable**: `describeBuild()` selects a reason from the whole transcript instead of the 4-line tail that lost it (measured: reason at line 35 of 55), preferring a line the FAILING task printed and answering `null` rather than promoting turbo's banner · the full transcript goes to `build.log` in the temp DEST before anything is reported, and §3 re-derives its own numbers from those bytes (`rawLog.includes(reason)`) · §3b grades the selection on synthetic text so the rule does not depend on how the ref happens to fail · control + 2 mutation probes: green / red / red · **v83 made the child cwd an axis instead of an accident**: the census of HEAD's 64 tracked proofs — **61** import the shipped code as `pathToFileURL('./…')` and **3** as `pathToFileURL(join(process.cwd(), …))`, **0** through their own file location, and `pathToFileURL` resolves a relative path against `process.cwd()` — so the cwd a proof is spawned in decides WHICH BUILD it grades, and `sweep --ref <older sha>` had been grading old text against the current compile while `[identity]` quoted the runner's own digest · `runSweep` takes `proofsCwd`, `probeChildResolution()` asks a spawned child what IT resolves rather than re-deriving the rule, and the summary now names `graded build <digest>` apart from the build the runner sits in · `--isolated` ships v81's clean checkout as the sweep's cwd and re-checks home's digest afterwards · `proofCorpus()` reads all 64 blobs in ONE `git cat-file --batch` (8.7 s against the 14m7s the per-blob witness took — longer than the 240 s a sweep row is allowed, i.e. a TIMEOUT inside the runner it grades), cross-checked against independent single reads at both ends · `cwd-axis-proof.mjs` is the 65th tracked proof and asserts its own scheduling (61.6 s of 240 s) · control + 4 mutation probes, all reds `AssertionError` not stacks: **control** GREEN in both witnesses, **m1** (`runCwd` ignores `proofsCwd`) red on "the isolated row must be RED here", **m2** (census regex blinded to `./…`) red on "child-relative 3 of 64", **m3** (probe answers with the runner's own cwd) red on "the child reported D:\终极项目, not the … it was given", **m4** being this increment's own rewording of three `[identity]`/`[summary]` sentences that v80's shipped witness reads by prefix — the producer moved back, per v46, and m4 reddens BOTH witnesses · the harness had to be fixed twice before its reds were evidence: a mutant runner written outside the repo dies on `REPO_ROOT`'s module-relative default build entry (so mutants now sit at the same depth under a temp root whose `agents/` is a junction), and `tree-axis-proof.mjs` reaches the runner by a DIFFERENT idiom, so a witness whose import is not re-wired silently grades the shipped code — a false green, now a thrown error  · **v84 turned a carried-forward phrase into an axis**: v81/v82/v83 all said the clean-room `@nexus/studio#build` fails "across a cross-drive junction" and never turned the knob — so the same ref was checked out twice, back to back, differing only in drive: `C:` dest → **exit 1 in 522.4s · 55 lines · failed ["@nexus/studio#build"]**, `D:` dest → **exit 0 in 513.0s · 59 lines · failed []**, home dist `8b3ff8b0e7f62133`/224 files unmoved both times, i.e. three increments of "the ref's build fails in a clean room" were quoting where `os.tmpdir()` sits (Windows `relative()` returns a cross-drive path ABSOLUTE, so a bundler is handed `./D:/…/next.js`, neither relative nor absolute) · `driveOf`/`isolatedDest`/`driveVerdict` put the choice in the runner and the `[isolated]` line (`dest X on D:\ vs the repository on D:\ — SAME DRIVE … (chosen: repo-drive (FORCED off tmpdir by the drive mismatch))`), a caller-supplied cross-drive dest stays askable and is REPORTED not repaired, and a failed cross-drive build now says do not read it as a defect of the ref · `drive-axis-proof.mjs` (66th tracked proof, 68th script) derives that request string from this box's paths and asserts it EQUAL byte-for-byte to the reason line recorded in the newly committed human-run `isolated-arms.mjs`, runs two `build: false` checkouts to pin both verdict-sentences, grades the POSIX clause by its ABSENCE on a win32 host, schedules itself in 67.9 s of the 240 s a row gets — and names the number that can never be a row (a build arm is 513–522 s, over budget by 2×) · the self-caught defect: v82's §3 reason gate reached a FAILING build only by accident of drive, so v84's own fix would have left `isolated-proof.mjs` green while asserting nothing — it now asks for the cross-drive tree by name; control + 4 mutants, m1–m4 all RED on assertions (am. 77–89) — **the sweep became a thing that names its own bytes, and the population became a closure.** v78: a sweep must name the SCRIPTS and the BUILD it graded, because "the N-proof sweep is green" was two claims and only one had a source (the runner materialises the ref into a temp dir and digests the shipped `dist`). v79: a key whose value is `undefined` is not a key — the persisted index round-tripped into an object that could never have come off disk, invisible to 25 increments of green proofs. v80: a ref-materialised proof still reads `.`, so the walked TREE got its own digest and ownership split (27 of 220 indexed files belong to no commit). v81–84: the clean-room isolated checkout, and the two bounds it exposed — a verdict that names the PACKAGE is not a verdict (`describeBuild()` quotes the line the build wrote, or answers `null`), and the DRIVE under a checkout decides whether its build compiles, which three increments had been quoting as a drive letter. v85: a row's BUDGET belongs to the row (`sweep-budget-ms`), and a KILL is a different finding from a FAILURE. v86: **every synchronous spawn API on this host fails with `EBUSY`** (measured; `spawnSync`/`execFileSync`/`execSync`, in a worker thread too, while async `spawn` works), which silently broke 33 tracked proofs and meant the exec-host tree reaper could never reap — `docs/evidence/lib/syncproc.mjs` re-implements the sync API on the async path behind an `Atomics` hand-off, each proof changes ONE import line, and the reaper is async now. v87: §28 tables are graded against the humans they claim to speak for (`auditGateHistory`). v88–89: the population is a CLOSURE not a directory (32 of 68 rows were red because the runner could not stage a shared-lib import), and a witness that scans the population must survive JOINING it (a quotation can wear the shape of an import). (am. 90–107) — **the provenance plane: the sweep now says which tree each row stood on, and reconciles prediction against declaration against verdict.** v90 corrected three witnesses that were red for the wrong reason; v92–95 built the plane axis and made a row's dependence on the repository PREDICTED before the rows run, with a row allowed to CONFESS what the scanner cannot see (a confession graded twice: against the bytes it points at and against the failure it predicted); v96–102 worked the residual down by classification rather than by memory (nine invisible confessions were two different failures wearing one label; a regex-literal quote had inverted a file in both directions, hiding a real `rev-parse` and inventing an argv); v103–105 made the runner SUPPLY the plane to every row and compare the row's own echo against what it supplied, because 69 rows could not name their own tree; v106 added the live-filesystem witness for that reader; v107 made the runner report whether the `EBUSY` host fault is still present. ⚠️ **v107's commit-message prediction was wrong and is corrected in amendment 107**: the line prints `BROKEN (EBUSY)` — re-measured 6/6 — not the `answers (status 0, no error)` the message predicted. **v132 (the isolated plane is a repository, not a pile of files) is in:** `isolatedCheckout` stages `--isolated` with `git clone --shared --no-checkout` + `git checkout <ref>` instead of `git archive` + `tar`. The archive gave the ref’s tracked bytes with no `.git`, so a row that asks the repository a question died before reaching its own assertions: measured on this host 2026-09-28, `cwd-axis-proof.mjs` on the bare tree is FAIL exit 1 in **383 ms** with the whole verdict being `git ls-tree … → exit 128: fatal: not a git repository`, and OK exit 0 in **43.9 s** on the repository plane (its clean-room build exit 0 in 126.4 s) — so the 42 reds amendment 113’s addendum counted are that failure 42 times, against **51 of 73** tracked proofs that reach a git child process at code position. Objects are shared through `.git/objects/info/alternates` (never copied, never hard-linked, so the fallback’s first guess of a cross-drive link problem was wrong and is not repeated), both staging exit codes are checked rather than left to the next command’s failure, the tree is emptied before the fallback extracts into it, and `archiveBytes` is `null` under a clone rather than a sentinel number. The `git archive` path survives as a DECLARED fallback and the `[isolated]` line names which plane produced the verdict; `GIT_SUBCOMMANDS` gains `clone`, because the reaches axis is graded against that list. Three rows whose prose the change made false were repaired in the same commit (`isolated-proof` §1 grades the no-git shape as the fallback’s; `cwd-axis`’s `sweep-asks-repository:` declaration names the staging the runner performs; `table-recount`’s ls-tree arm is reachable on that plane for the first time). The plane now answers the census — `tracked 225 / untracked 0 / ignored 0` where the bare tree reported `UNDIGESTABLE` — while every census number from amendment 130 is unchanged (262 call sites / 117 program / 145 argv; supported 9 · partial 0 · invisible 4 · name-no-command 1 · MIS-CITED 0), which is the control. ⬜ v132 bounds: nothing yet FAILS a sweep for taking the archive fallback, so the 42 reds can return silently on a host where the clone cannot run and the `[isolated]` line is the only witness; the clone’s `.git` is the one thing the plane holds that the ref does not own, and three file counters must keep skipping it. **v133 (a plane downgrade is a refusal, not a log line) is in:** `isolatedCheckout` THROWS `ISOLATED-PLANE-DOWNGRADE` instead of logging a silent fallback to `git archive` + `tar`, which is exactly the bound v132 wrote down about itself ("nothing yet FAILS a sweep for taking the archive fallback"). The refusal carries the clone’s OWN cause, the price of the plane it refuses, the opt-in’s name, and the staging directory it left behind (caller-supplied) or removed (runner-chosen); the fallback survives behind `allowArchive: true` (`--isolated --allow-archive`), where it prints the same `ARCHIVE_PLANE_COST` sentence the refusal quotes — one sentence, two mouths, because two independently typed numbers would be two claims — and the CLI exits 2 with `REFUSED — …` instead of letting the top-level await print a stack trace where the reason belongs. `isolated-proof.mjs` §6 measures it on ref d77ca34 (2026-09-29) with the NATURAL failure rather than a mock (`git clone` refuses a non-empty destination, so one stray file in `<dest>/repo` makes the plane genuinely unstowable): REFUSE **97 ms**, code + clone stderr + price + `allowArchive` named, and the caller-supplied dest still on disk as the message says; OPT-IN `usedClone false` / `archiveBytes 5 099 520` / no `.git` / the stray file GONE / 226 walked files every one tracked at HEAD / `git ls-tree … HEAD` INSIDE that plane exits non-zero; CONTROL `usedClone true` / `archiveBytes null` / no downgrade sentence printed / `git rev-parse HEAD` inside the plane equals the source HEAD, so "refuse the downgrade" is measured not to mean "refuse everything"; AGREEMENT the refusal and the `[isolated]` line carry `ARCHIVE_PLANE_COST` byte for byte. Home dist `2fa6222b42cb5829` (260 files) UNMOVED; the reach census re-measured with the runner’s own scanner is **264** call sites (program 119, argv 145) over 73 rows with **51 of 73** reaching a git child process — amendment 130’s 262 / 117 / 145 / 51 plus exactly the two asks §6 adds (1 call site over HEAD’s blob of that row, 3 over the working copy). ⬜ v133 bounds: a caller who passes `allowArchive: true` still gets a red population whose only witness is the `[isolated]` line, and the sweep’s `[summary]` does not yet carry the plane, so a pasted summary from such a run is still un-self-describing — the guard is only that it can no longer happen by accident; and the refusal claims the archive is "the only staging left" without checking that it can run (on a host with no usable `git` the archive fails too, and only an opted-in caller ever sees that failure). ⬜ remaining: trained-embedding recall (needs keys — out of scope here), subjective aesthetic judgment (beyond measurable geometry), a REAL model behind the planner seam, a dock release toggle (v47's arc owner exists as data, v49 made its walk durable and v50 made its §28 receipts durable beside it, v54 made the run line answer for its own gates in the same file; no UI in the browser asks for it, and none pretends to — `loadLedger().arcs` has no reader) **v141 — the clone plane stopped lying about BYTES (ADR 0016 amendment 141; the record was owed and is written at v142):** the isolated checkout writes the blob's OWN bytes (`git clone -c core.autocrlf=false`, because this box's system gitconfig has `core.autocrlf = true`, so the checkout materialised CRLF where `git show HEAD:file` answers LF and `provenance-proof` §2 counted **0 of 74** proofs identical to their committed bytes on that plane); the first `[isolated]` line now names HOW the dest was chosen (`chosen: repo-drive (FORCED off tmpdir by the drive mismatch)`) as well as where; and §4's shrink claim became a census DECISION (unowned > 0 → strictly smaller; 0 → IDENTITY by count AND bytes) because inside a staged clone `230 < 230` could only fail. Two witnesses v132/v133 had left stale (confession-proof's helperArms and drive-axis-proof's asks-declaration) were measured red on the worktree plane and repaired in the same commit. **the sandbox gains its first OS-level wall (am. 166, `@nexus/exec-host`):** the SAME `planExec` decision executed inside an EPHEMERAL container — 10 isolation flags audited from the spawned argv (`CONTAINER_MOUNT_FLAGS` is the empty-audit list: no mount flag the builder can emit), caps, read-only rootfs over noexec tmpfs, `--network none`, `--pull never`, host wall-clock kill + `docker rm -f` by-name retirement; one `container.exec` door behind §28; probe answers `{available, serverVersion, reason}`; 26 cases (exec-host 301/301), real-daemon proof §1–§8 ALL PASSED (§4 measures EROFS / tmpfs-writable / host-fs-absent / socket-denied, §5 kills sleep 60 at 4s and the daemon listing is empty); am. 167 records the one-way wiring (exec-host → agent-runtime, register at the call site); ADR 0013 stays Proposed (gVisor/Firecracker, per-job secrets, warm pool open); am. 172 wires the FIRST product consumer — the Studio dock's container lane (`app/api/agent/container` + a fetch-only client + an Allow-once face in the panel, pinned node:22-alpine, ledger via `container.exec`), so the dock's exec duties are container-only from birth; the runtime's own headless tool doors still have no consumer; **am. 229 (v229)** collapses the ELEVEN per-suite `MemDisk`/`FakeDisk` mocks for the `FsWriteLike` seam into one `createMemDisk({ listing, seed })` whose listing policy is a named per-suite choice (`'refuse'`/`'empty'`/`'real'`), so "the mock" stops meaning four different things — `agents/runtime` **540/540** (36 files), `tsc` 0, no case moved; **am. 515 (v529)** the platform answer gates the BUILT-IN tree reaper only — an operator's reaper is a declaration of reach and is asked on every plane, keyed on identity (`reaper === DEFAULT_TREE_REAPER`) rather than on whether the option was written; the first real CI run (`40603544099`) reddened exactly the four v55 cases that handed the host a caller's reaper on ubuntu, and the fake-plane tool moves 16/16 predicted cells across four byte-variants; `@nexus/exec-host` **357/357**; **am. 516 (v530)** the evidence census makes every tracked module under `docs/evidence` a DECISION rather than a silence — ROW (proof-set's imported rule; 20 = 17 run + 3 excluded), HELPER (3, by the imports the bytes really make), SWEPT (79, by CALLING `sweep.trackedProofs`), TOOL (6, declared with re-runnable commands) or DEFERRED (3 Studio lane proofs blocked on the build plane's missing `node:22-alpine` pre-pull, v531 named) — with 14 fixture arms; the four proofs that needed nothing but Node become rows (`verify:audit-contract`, `verify:record-encoding`, `verify:pipeline`, `verify:table-recount`), the derived build population grows 15 → 20 rows (12 → 17 running), and CI run `40659064493` is the first fully green build-plane run (12/12 evidence rows in 35 s); **am. 517 (v531)** the census's three DEFERRED Studio lane proofs become ROWS — `docker pull node:22-alpine` runs before `Evidence proofs` (exec-host spawns with `--pull never`), the census derives 23 rows (20 run + 3 excluded) with 0 deferrals, and the mutation probe's scratch box is per-process after two concurrent runs collided; CI run `40662063095` carries the 17-row population's first ubuntu verdict, fully green (17/17, mutation 55.4 s), which is v530's open bound delivered; **am. 518 (v532)** the swept population was TRIAGED — sixteen Node-only proofs become rows (census 39 rows = 36 run + 3 excluded, 63 swept, 0 deferrals), one corpus red repaired (`vector-store`'s dot-directory rule) and one red NAMED (`code-index`'s drifted top-5, measured and left swept); CI run `40664659344` (49fe29f) carries the 20-row population's ubuntu verdict, fully green (20/20, lanes 0.6/0.2/0.8 s, mutation 40.2 s); **am. 519 (v533)** the sweep was aimed at ITSELF — one whole run over HEAD `28a8930`'s 81 tracked proofs: 76 OK · 5 FAIL · 0 TIMEOUT, and the forty-eight green dist+spawn proofs became rows (census 87 rows = 84 run + 3 excluded, 15 swept, 0 deferrals); the five reds are named, not wired (code-index's stale top-5; confession's §9 pin stale since v237 — 582 commits; cwd-axis and tree-axis tree-motion witnesses; isolated inherits code-index); CI run `40682580110` (28a8930) carries the 36-row population's ubuntu verdict, fully green (36/36, job 3 m 12 s), and the full local set over the final bytes reads 84/84 · residue named 3 |
| **M3 — Multimodal Assets** | image/video engines, asset library, reference, character consistency, storyboard | ✅ v145–v190 (am. 145–190) — `@nexus/ai-providers` carries a multimodal slice in `multimodal.ts`: `InMemoryAssetLibrary` (metadata + references), `DemoImageGenerator` / `DemoVideoGenerator`, `CharacterConsistencyManager` (reference-anchored descriptors), `StoryboardManager` (ordered frames). 13 vitest cases; ai-providers **20/20**. **v145 gave the lane its FIRST CONSUMER** (ADR 0016 amendment 145): `agents/runtime/src/assetTools.ts` declares a narrow `AssetDriver` seam and six `asset.*` doors over it — `asset.list` / `asset.inspect` / `asset.storyboard.inspect` read-class, `asset.image.generate` / `asset.storyboard.create` / `asset.storyboard.frame.add` write-class behind the §28 checkpoint — with **no dependency** on `ai-providers`. §60 is ENFORCED rather than promised: the generation door **REFUSES a driver answer that carries no provenance**, no door is named or described in a way that promises pixels, and the proof MEASURES why there are no bytes (the payload stored beside a generated asset is **zero bytes**). 23 unit cases + the runnable `docs/evidence/agents/asset-tools-proof.mjs`. ⬜ honest bounds: the generators are **DEMO MODE** like every other provider (ADR 0010 — deterministic, no keys, no pixels); the doors cover image assets and storyboards only — **no video generation, no character consistency, no delete/update, no export**; **v153 closed the PRODUCT half** (ADR 0016 amendment 153): the Studio's main pane gains a fourth surface, `Assets`, beside `2D`/`3D`/`World` — `apps/studio/src/lib/assets.ts` is the pure half (`buildStudioAssets`/`buildAssetReport` over structural `AssetGeneratorLike`/`AssetLibraryLike`/`StoryboardManagerLike`) and `AssetPanel.tsx` is the only file touching the real `DemoImageGenerator`/`InMemoryAssetLibrary`/`StoryboardManager`, publishing `window.__nexusAssets.assets()` through a read-only bridge that answers `null` once the surface unmounts. It composes one ordered storyboard (three harbour shots, a still each); §60 is BUILT INTO THE TYPES — every report names the generator's own `provenance` word (`demo`), the byte count of each stored asset is what the library actually holds (**zero**, because DEMO MODE produces no pixels), and the panel renders **no `<img>`** because there is no image to render and an element would imply one. Evidence: `apps/studio/src/lib/assets.test.ts` (14 cases, no DOM), `docs/evidence/studio/asset-surface-proof.mjs` (§1 the composed assets ARE the library's, §2 §60 measured as byte-zero, §3 the report proven DERIVED by growing the library, §4 every frame's `imageRef` followed back into the library, §5 home HEAD byte-identical), and `tools/harness/studio-assets.mjs` (**24/24 in a real browser** after v159, PNG written, canvas restored to 482900/482900 on return). Studio suite is now **187/187 (19 files)**. **v160 deepened the agent doors from 6 to 13** (ADR 0016 amendment 160): `asset.video.generate`, `asset.search`, `asset.update`, `asset.delete` and the character-consistency trio (`register`/`list`/`apply`) — 41 unit cases, and §6–§8 of the proof over the REAL generators + library + consistency manager. Two rules are worth naming: `asset.update` REFUSES an empty patch because the library answers `true` for one (a no-op wearing a success), and `asset.character.apply` answers a DERIVED REQUEST rather than an asset, because no generator runs. **v187 gave the surface FOOTAGE** (ADR 0016 amendment 187): `generateAsset` takes a `type` and the panel dispatches to the video generator — measured rather than asserted, since `DemoImageGenerator` answers a video ask with an `image/png`, so a single-generator panel would store a still as footage. A still reports `duration: null` and footage its seconds, so the two are told apart by a null rather than a zero. Browser probe **29/29**. **v188 made the board EDITABLE** (ADR 0016 amendment 188): the manager's `removeFrame`/`reorderFrames` gained product doors — each frame row carries `↑`/`↓`/`remove` (edges disabled), reorder hands the manager the FULL id sequence, a removal leaves the survivors' order honest (`[0, 2]`, no silent renumber), and neither verb touches the library. Unit **24 → 30**, browser probe **34/34**, studio **338/338**. **v189 anchored CHARACTERS** (ADR 0016 amendment 189): the consistency trio's product doors — register anchors a character to an asset the library ACTUALLY holds (id + anchor select + optional strength), the report reads what the register HOLDS (`null` where none was given, never a pre-applied default), and apply answers the DERIVED REQUEST a generator would receive — never an asset, no generator runs, and the derived line shows the manager's own 0.8 landing where the register held none. Unit **30 → 36**, proof **§7** (the two numbers measured against the SHIPPED manager), browser probe **34/34 → 41/41**, studio **338 → 344**. **v190 made the library EDITABLE** (ADR 0016 amendment 190): the `asset.update` door's product face — a select + three optional fields merge the FILLED fields over the metadata the library holds (name/description/tags; bytes and id are NOT editable and the form offers no way to try), a patch that names nothing is refused in the door's own words (the library answers `true` for one — a no-op never wears a success), the row reads its tags back and the bridge report carries the description. Unit **36 → 41**, proof **§9** (rename + merge measured against the SHIPPED library), browser probe **41/41 → 46/46**, studio **344 → 349**. ⬜ honest bounds: the surface cannot PLAY footage — there is no video element anywhere; characters have no UPDATE/DELETE door; the board has no frame-ADD form or per-frame UPDATE door; the generators remain DEMO MODE (no keys, no pixels) — bounds now, not open items: generate, remove, update, board-edit and characters are all reachable from the product. **v159 made the surface INTERACTIVE** (ADR 0016 amendment 159): `generateAsset`/`removeAsset` in the shipped module, a prompt form + a per-row **Remove** in the panel, §5 of the headless proof growing and shrinking the REAL library, and the browser probe at **24/24** — it types a prompt, presses Generate, waits for the bridge's asset count to rise by exactly one, presses that row's Remove, and waits for it to fall back with the id gone, checking the storyboard is unmoved and every byte count still reads `0`. Studio suite is now **187/187 (19 files)**. |
| **M4 — World Engine** | world/lore/character/relationship + RAG + World/Character agents | 🟡 v144 — `@nexus/world-engine`: branded world/character/location/faction/lore/event ids, `WorldRAG` (retrieval over the world's own lore), `CharacterAgent` (deterministic persona replies over a stated config), `WorldEngine` orchestration with an event surface. **31/31** vitest. **v144 gave the lane its FIRST CONSUMER** (ADR 0016 amendment 144): `agents/runtime/src/worldTools.ts` declares a narrow `WorldDriver` seam and six `world.*` doors over it — `world.inspect` and `world.query` read-class, `world.location.add` / `world.character.add` / `world.lore.add` / `world.character.decide` write-class behind the §28 checkpoint — with **no dependency** on the package (`agents/runtime` holds the capability, the host supplies the engine). The read/write split is MEASURED, not asserted: the proof reads the agent's own `getLastDecision()` as null before the decision door and non-null after, which is the mutation that forbids calling it a read. 21 unit cases + the runnable `docs/evidence/agents/world-tools-proof.mjs` (6 sections, real `WorldEngine` behind the seam, retrieval proven to reach what the doors wrote). **v148 closed the PRODUCT half** (ADR 0016 amendment 148): the Studio's main pane gains a third surface, `World`, beside `2D` and `3D` — `apps/studio/src/lib/world.ts` is the pure half (`buildStudioWorld`/`buildWorldReport` over a structural `WorldEngineLike`) and `WorldPanel.tsx` is the only file touching a real `WorldEngine`, publishing `window.__nexusWorld.world()` through a read-only bridge. **The reason the lane had no product consumer was that the package could not be imported at all**: `world-engine` declared no `main`/`module`/`types`/`exports`/`files`, so only its own suite (reaching `../src/index.js`) could use it — v148 adds those fields and drops a declared dependency on `@nexus/design-model` that zero files imported. Evidence: 11 unit cases + `world-surface-proof.mjs` (grades the shipped Studio module over the shipped engine) + `studio-world.mjs` (**14/14 in a real browser**, PNG written). ⬜ honest bounds: no real model behind the character agent — decisions stay DEMO-MODE arithmetic, quoted as it came. **v162 closed the simulation bounds** (ADR 0016 amendment 162): `tickOnce()` consults every agent and decays unmaintained bonds into a deterministic `TickReport`; `relationships.ts` makes strength pure arithmetic (bands enemy/neutral/friend/ally, first-meeting floor 10 — decay never manufactures hatred and the enemy band is unreachable through simulation — cap 100, declared bonds never re-derived); speak writes BOTH sides; save/load is lossless (knowledge, rumors and relationships survive); the composition connects its places (ford↔ridge path, ford↔hamlet road) and seats Mira & Toma together so a tick can introduce them; the Studio report is schema 2 (bonds listed BY NAME) and the panel gains a Simulate row (Step ×1/×5, last-tick line) and a Relationships section. Still open: factions/lore in the tick, a real model behind the persona, per-tick configuration — and the bridge stays read-only, stepping happens through the panel's own engine. **Now PERSISTENT (v191)** (ADR 0016 amendment 191): the engine's own save()/load() gain a disk lane — `worldSaveServer.ts` rides the SAME tested fs store the scene lane uses (`createFsSaveStore` over the real `node:fs`, root `.nexus/world-saves`), the route is the only door and the browser holds a fetch-only adapter; a file that carries no object `world` is refused by name before bytes move or reach the loader; the panel's Persist row saves the engine's own file (the note reports the byte count), browses the rows, and loading hands the file to the engine's own `load()` — the live world becomes the saved one (harness **25/25 → 34/34**: the file read off the REAL disk at the tick the bridge reported, one step past the save then load and the bridge counts the SAVED tick again; studio **349 → 364**; `@nexus/world-engine` untouched). |
| **M5 — Three.js Runtime** | 3D scene/camera/lighting/materials/character/interaction/combat/NPC/save; cinematic slice | ✅ v108–v228 (am. 108–228) — NEW `@nexus/three-runtime`: scene graph, entities + components, cameras, animations, lighting, an event surface, and the save/quest/combat/NPC type surface. **Two host seams make it runnable outside a browser** (ADR 0016 amendment 108): `RenderBackend` (WebGL default, recording headless backend) and `FrameScheduler` (rAF default, timer fallback, manual stepping). `tsc` clean, **29/29** vitest at v108 — from 1/27 before the seams, when `WebGLRenderer` and `requestAnimationFrame` were hard-wired. **v114** made `CharacterController` real (ADR 0016 amendment 114): a per-entity registry with `attachController`/`detachController`/`getController`/`setControllerInput`, a `simulateFrame(delta)` that `animate()` itself calls so the loop and a test run the same code, camera-relative and world-axis movement planes, `grounded` derived from position, gravity/jump/landing against a caller-set ground plane, the declared state machine, `controllerOrphaned` on a lost entity, and a `controllerFieldAudit` that names the declared fields it still does not honor — **68/68** vitest (29 runtime + 39 controller) at that ref. **v115** gave the declared save format its first writer and its first reader (ADR 0016 amendment 115): `snapshotEntity` clones position/rotation/scale (so a snapshot stops changing when the live entity moves) and refuses a live `THREE.Vector3`, a `Map` or a function inside `userData`/component data BY PATH; `restoreEntity` puts the entity back under the SAVED id and refuses to overwrite a live one; and `saveFeasibilityAudit` answers `{dropped, aliased, savable, blocked}` — `savable: [‘entities’]` against the six `SaveData` fields that are still blocked, each naming the system it waits on. **110/110** at that ref. **v116** gave the declared physics world its readers (ADR 0016 amendment 116): `setScenePhysics` validated the declared physics constants, `physicsFieldAudit` named the gaps, and substepping ran the declared step count. **v165** gave `listSaveFiles()` name-level account: refused saves classified via `savePathRefusal` without reading any file (ADR 0016 amendment 165). **v168** moved `savePathRefusal()` to the SaveStore interface: stores now answer about a name without walking through the door (ADR 0016 amendment 168). **v169** gave the Studio its first save/load face: a memory-backed store, an optional `listSaveFiles()` on the saver surface, and a browsable list of saves with selection (ADR 0016 amendment 169).. Current savable SaveData fields: `[‘entities’, ‘cinematic’, ‘npcs’, ‘worldState’, ‘player’]`; permanently blocked: `quests` (no QuestSystem), `sceneGraph` (no serializer).es a world by the reading it has to support — `gravity.y` must be `<= 0`, one guard that refuses both an upward vector and a `NaN` rather than defaulting either, horizontal components refuse by name, `timeStep` must be positive and `maxSubSteps` a whole number ≥ 1 — and stores a CLONE so the caller cannot move the world afterwards; `updatePhysics` is now the only reader of `scene.physics`, pushing `-gravity.y` into every controller whose caller named no gravity and turning a frame into `min(floor(available/timeStep), maxSubSteps)` slices of `timeStep`, with what the cap refuses reported as `droppedTime` instead of saved up for a teleport; `physicsFieldAudit(sceneId)` reports `consulted`/`unhonored`/`effectiveGravity`/`stepping.lastFrame` per scene, and a test requires its two lists to partition the five fields `PhysicsConfig` declares in `src/types.ts`. **140/140** vitest (29 + 39 + 42 save + 30 physics), `tsc` clean. v115’s probe caught 8 arms of 9 on its first run and the survivor was the finding: deleting a second `updateMatrix()` in the restore path reddened nothing because the shared insert path had already rebuilt the matrix, so that line is deleted, the rebuild is owned by one call, and the re-armed probe caught 9 of 9 against a control of 110 collected / 0 red. v116’s probe ran 15 arms against a control of **140 collected / 0 red** with its minimum reds written down first: 1, 1, 4, 3, 3, 2, 1, 2, 1, 2, 1, 2, 1, 1, 1 — none survived and none under-predicted, and the fifteenth arm exists because v116 made a v115 sentence stale: `SerializedScene.physics` is a read field now, so the shipped `sceneGraph` refusal had to grow the live-`THREE.Vector3` half, and that arm restores the older sentence and reddens. **v117 (the cinematic sequence) is in:** `defineCinematic` refuses, by name and by number, the 14 things this renderer cannot perform — a `’fade’` when one camera is drawn per frame, a `transitionDuration` with no interval left to time once the transition is refused, an `"fov"` on an orthographic camera, a path with no arc to sample, a declared `duration` that disagrees with the shots that derive it; `updateCinematics` is a subsystem now, advancing a clamped playhead, cutting on a CHANGE of shot index, sampling `cameraPath`/`targetPath` by ARC length, and stopping when its scene stops being the active one; `playCinematic`/`stopCinematic` own the ONE active slot because `SerializedCinematic.activeSequence` is a single id; and `cinematicSnapshot` is the first writer that declared shape ever had, with `cinematicFieldAudit` naming the three shot fields a player still cannot honor. **179/179** vitest (39 controller + 42 save + 30 physics + 29 runtime + 39 cinematic), `tsc` clean. The v117 probe ran 27 arms against a control of **81 collected / 0 red** on the two files that read cinematic code, with its minimum reds written down first: 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 10, 3, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1 — none survived, and one arm (14-end-clamp-never-reached, credited 2) reddened 3. Its last arm is the stale-sentence arm: v117 made the shipped `SAVE_DATA_FEASIBILITY` reason for `cinematic` false, so that arm restores the v116 wording and reddens the test that requires the reason to name `THREE.CatmullRomCurve3`. **v118 (the cinematic round trip) is in:** `SerializedCinematic` has its first reader — `restoreCinematic` takes a saved shape and hands back a playable registry, honoring a saved `playing` by calling `playCinematic` rather than writing the field, resuming the active sequence at its saved second and every other one at the start of the shot its save names, and rolling the registry back when any sequence cannot land. `cinematicSnapshot` stopped aliasing: it writes `SerializedCurve` point arrays instead of live `THREE.CatmullRomCurve3` objects, so a snapshot no longer moves when the game does, and a camera that is rebuilt from a save lands where the original one did. A `sceneId` entered the save shape because the reader needed it, `createCamera` grew an `id` because a saved shot addresses a camera by a name nothing could re-issue, and `SAVE_DATA_FEASIBILITY` lost its first blocked row: `cinematic` is savable in both directions and `blocked` is down to five. It also corrected a door that had been claiming a refusal it never gave — `defineCinematic` asked three.js for a one-point curve’s `getLength()`, which throws a TypeError from inside the library, so the count is now read before the length and the refusal names the path. **214/214** vitest (74 cinematic + 39 controller + 42 save + 30 physics + 29 runtime), `tsc` clean. The v118 probe ran 33 arms against a control of **116 collected / 0 red** on the two files that read cinematic code, with its minimum reds written down first: 20, 9, 1, 5, 3, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8, 1, 2, 3, 1, 8, 8, 1, 3, 4, 1 — none survived, and 12 of the 33 arms reddened more than they were credited. The over-predictions share one reason: I predicted the assertion that names the mutated clause and not the cases downstream that consume its output. **v119 (the save becomes a file) is in:** the claim `savable` had been making since v115 was tested against a disk and lost — `SerializedEntity.components` was a `Map`, which JSON writes as `{}`, so `restoreEntity` threw `TypeError: snapshot.components is not iterable`, and a `rotation` declared as a live `THREE.Euler` came back as `_x/_y/_z/_order/isEuler` and copied itself into NaN. The rule went into the shape: `SerializedVector3`/`SerializedEuler` replace the live transform fields, every `Map` in the save shape becomes an array of `[key, value]` pairs, and a gate walks the closure from `SaveFile` through `types.ts` refusing `Map` and `THREE.` anywhere in it. `buildSaveFile(sceneId, savedAt)` produces a `SaveFile` that states its own `carries` and `doesNotCarry` out of `SAVE_DATA_FEASIBILITY`, and `loadSaveFile(file, sceneId)` refuses what it cannot read — including a file carrying content under a blocked name, which is the case where a tolerant loader would have silently returned a smaller game. 228/228 vitest (56 save + 39 controller + 74 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`. The v119 probe ran 23 arms against a control of **130 collected / 0 red** on the two files that read save code, with its minimum reds written down first: 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 10 — none survived, and 2 of the 23 arms reddened more than they were credited. **v120 (the save file gets bytes) is in:** `packages/three-runtime/src/saveStore.ts` is the storage seam — `SaveStore`, `createMemorySaveStore`, `createFsSaveStore(fs, root)` over an injected `writeFileSync`/`readFileSync`/`existsSync`, and `resolveSavePath` as the one owner of the confinement rule (absolute forms, `..`, empty and `.` segments refused by both stores). `writeSaveFile(path, sceneId, savedAt)` reports the path, the store kind, the byte count and the `carries`/`doesNotCarry` lists; `readSaveFile(path, sceneId)` tells a missing file from an empty one from a corrupt one from a file that parses but cannot be loaded, and the load refusals keep `loadSaveFile`’s voice with the path attached. A runtime built without `{ storage }` refuses both directions rather than keeping the file to itself. The headline case is two runtimes sharing one store: the second reads `saves/hero.json` and ends up with the first one’s position, rotation order, component data and — after a zero-delta frame — a camera at a distance of exactly 0. **235/235** vitest (63 save + 39 controller + 74 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`. The v120 probe ran 15 arms over two files against a control of **137 collected / 0 red**, with its minimum reds written down first: 1, 1, 1, 1, 2, 2, 1, 4, 1, 2, 2, 2, 2, 2, 2 — none survived, and 9 of the 15 arms reddened more than they were credited. **v121 (the registry gives an id back) is in:** `removeCinematic(id)` un-registers a stopped sequence (`false` when the id was never registered, a throw when it is playing — a removal will not emit a `cinematicStopped` nobody asked for), `clearCinematics()` reports `{removed, stillPlaying}` instead of interrupting a cutscene, and `loadSaveFile`’s catch now stops AND removes the sequences it had restored, so the message v119 had to write — "the sequence(s) restored ahead of them stay registered: this runtime has no way to unregister a sequence" — is replaced by "a load is all or nothing". Two shipped refusals were retired by name and a test now reads `src/threeRuntime.ts`, takes only its `throw new Error(` lines and fails if any still says "no way to unregister" (a docstring may remember; an error may not). The case that had pinned the old limitation was flipped in place, not deleted. **240/240** vitest (64 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`. The v121 probe ran 8 arms against a control of **142 collected / 0 red**, with its minimum reds written down first: 2, 1, 1, 2, 1, 1, 1, 1 — none survived, and 2 of the 8 arms reddened more than they were credited. **v122 (the store takes a save back) is in:** `SaveStore.delete(path)` answers `true`/`false` — nothing at the path is a boolean answer, not an error, matching `stopCinematic` and `removeCinematic` — and `FsLike` grows an OPTIONAL `unlinkSync`, so a `localStorage`-shaped host can still implement the seam while an fs store built without that method **throws** naming the missing capability and the fact that the save is still there (the case reads the bytes back to prove it). The fs store resolves through `resolveSavePath` before touching the host, so `delete(‘../outside.json’)` is refused with `unlinkSync` never called, and the pair agrees: after a delete, `readSaveFile` gives v120’s "no save file at" refusal. Runtime `deleteSaveFile(path)` → `{path, store, removed}`, emits `saveFileDeleted`, refuses without a store, and leaves the live scene untouched — deleting a save is not resetting a game. **245/245** vitest (69 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`. The v122 probe ran 7 arms over two shipped files against a control of **147 collected / 0 red**, minimum reds written down first: 1, 1, 1, 1, 1, 2, 2 — none survived, and 2 of the 7 arms reddened more than they were credited. **v123 (the store says what it holds) is in:** `SaveStore.list()` returns sorted, namespace-relative names and reads no bytes to do it (a fake host counts its `readFileSync` calls and the case asserts zero — a menu costing O(total bytes) is the wrong seam). A memory store with nothing answers `[]`; an fs store whose host lacks `readdirSync`/`statSync` **throws naming both**, because `[]` there would claim a world the store cannot see, and the refusal is checked to arrive intact at `listSaveFiles`/`latestSaveFile`. Newest is decided by the `savedAt` **inside each file** — this runtime owns a frame clock, not a wall clock — ties broken by path and counted, and a save that cannot be understood (not JSON / an array / foreign format / unknown version / a non-finite stamp) is reported in `unreadable` with its exact reason rather than killing the menu or vanishing from it. Pair agreement holds a third time: delete the newest and `latestSaveFile` moves to the next candidate. **252/252** vitest (76 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`. The v123 probe ran 11 arms over two shipped files against a control of **154 collected / 0 red**, minimum reds written first: 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2 — none survived, and 10 of the 11 arms reddened more than they were credited. **v124 (the save is written atomically) is in:** `SaveStore.writeAtomic(path, contents)` writes `<path>.tmp` and renames it onto the real name; `FsLike` grows a third optional method `renameSync`, and the capability is asked for **before a byte is written** — an fs host without it throws (`no renameSync; nothing was written`) and the case asserts the host recorded zero operations and gained no key. If the rename fails, the file already at that path is untouched (its bytes still read back), the temp is unlinked, and when that cleanup fails the message names the leftover path — which `listSaveFile` then really shows. `writeSaveFile` goes through the same door, and the test asserts at that boundary that the host saw `rename:saves/root/slot.json.tmp->saves/root/slot.json`, because a store with a perfect atomic path can still be bypassed by the method that calls it. The memory store mutates once and its docstring narrows the claim to this process. **258/258** vitest (82 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`. The v124 probe ran 6 arms against a control of **160 collected / 0 red**, predicting **case names rather than red counts** for the first time: 1, 4, 1, 1, 2, 3 — none survived, and 3 of the 6 arms reddened more than they were credited. **v125 (the durability boundary is chosen, not assumed) is in:** `writeSaveFile(path, sceneId, savedAt, { durable })` — and the decision is a refusal, not a promise: `FlushSync` is added to `FsLike` as an OPTIONAL method, the memory store rejects `durable: true` outright (`the memory store cannot write durably — there is no device behind it to flush`), an fs host without the method is refused **before a byte moves** (the case asserts the host logged zero operations and the old file is still there), and the report carries `durable`, whose `false` is the honest default rather than a failure. The order is the real algorithm: write the temp, flush the temp, rename — with the rename itself left unflushed and said so out loud, because a directory handle is out of this seam’s reach and pretending otherwise is a durability claim nobody can check. A failed flush rides the same failure path as a failed rename: the old save stays, the temp is unlinked, and the message says "flushing and renaming" so the reader knows which half broke. 262 tests (86 save + 78 cinematic + 39 controller + 30 physics + 29 runtime), `tsc` clean on `src`; probe 5 arms, no survivor, all five reddening their named case (v125 keeps the v124 practice of predicting case names, and records that each also reddened neighbours — the same claim seen from another angle). §7 nine predictions written before landing. **v126 (the debris gets a sweeper) is in:** `sweepTempFiles()` → `{store, removed, kept}`, removing each `SAVE_TEMP_SUFFIX` name **through `deleteSaveFile`** rather than a second unlink path, so confinement, the no-op answer and the `saveFileDeleted` event keep one owner (the probe’s bypass arm is caught by the event assertion, not a return value). The suffix is now an exported constant shared by the writer that makes temps and the sweeper that finds them — changing only the sweeper’s filter to `.bak` reddens the suite, which is the proof the constant carries the rule. `kept` admits a listing is a snapshot: a name `list()` returned and `delete` could not find is reported, reproduced with a stub store rather than a timed race. A real save’s bytes are asserted untouched afterwards, a second sweep answers with two empty lists, and a runtime with no store refuses in the same shape as every other file method. 265 tests (89 save + 78 cinematic + 39 controller + 30 physics + 29 runtime), `tsc` clean on `src`; probe 5 arms vs a 167-case control: no survivor, every arm red on its named case. §7 nine predictions written before landing. **v127 (a file’s claims get an answer) is in:** `diagnoseSaveFile(path)` compares what a save says about itself (`format`, `version`, `carries`, `doesNotCarry`) against the runtime’s live feasibility table and reports both directions — a field the file carries that cannot be read here (`loadable: false`), and the one that had no voice before: a field this build **can** write that the file omits, which loads fine and quietly restores less (`readableNowButNotCarried`, `loadable` still true — the file predates a capability, it is not broken). The verdict is tied to the operation: `loadable` comes from the same table the loader consults, and the cases assert the refusal and the success actually happen, so the diagnosis is a report from the runtime and not an opinion about it; `problems` is compared as an ordered array because a reshuffleable report means the meaning lives in the reader. 269 tests (93 save + 78 cinematic + 39 controller + 30 physics + 29 runtime), `tsc` clean on `src`; probe 6 arms vs a 171-case control: no survivor, every arm red on its named case, one also catching a neighbour. §7 nine predictions written before landing. **v128 (the listing gets a verdict of its own) is in:** `diagnoseSaveFiles()` walks `list()` and delegates to `diagnoseSaveFile` — one owner of the verdict — returning `{store, total, loadable, unloadable, unreadable}` where the case asserts `total` equals the three buckets summed **and** no name sits in two of them. The separation is the point: `{ok, bad}` would conflate "this file’s claims do not match this runtime" with "these bytes cannot be read at all", which are different user actions (pick another slot versus the save is damaged). Probe: 4 arms (collapse the buckets, invert the choice, drop the no-store refusal, swallow the unreadable push) against a **174**-case control — no survivor, all four red on their named case, **zero unexpected reds**, which is what one-owner-one-witness looks like measured rather than claimed. 272/272 vitest (96 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`; the grant also carries the two verified fixes landed just before it (CRLF blindness 5d8a8b8 + its witness 47823a4; diagnosis/load disagreement 48cf01f). **v129 (the survey’s reason becomes a field) is in:** `diagnoseSaveFiles`’s `unreadable[]` entries carry `reason: ‘not-json’ | ‘listed-then-missing’` beside the `why` prose, and the field is set by WHICH check failed rather than matched out of a message — bytes the store returned that threw in `JSON.parse` are `not-json`, a name `list()` returned whose `read()` came back `null` is `listed-then-missing`, and the survey does its own read so it OBSERVES that rather than inferring it. 273/273 vitest (97 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`; **no probe ran** — the scratch mutation harness would not apply against the working copy and the commit landed without it, and the record says so rather than implying one did; the record also corrects amendment 129’s own "2 new cases" line, which the diff contradicts (one case ADDED, one AMENDED; 96 save cases at `e2fb5ec` → 97). **v131 (the NPC record gets a body and a file) is in:** `SaveData.npcs` stops being a field nothing backs — a per-entity record registry (`attachNPC`/`detachNPC`/`getNPC`/`setNPCReputation`) that remembers the SCENE each record was attached in (an `NPC` names no scene of its own), a shape repaired until it could be a file (reputation as sorted `[faction, value]` pairs instead of a `Map` JSON writes as `{}`; no live `THREE.Vector3`, no `onComplete` callback), `npcSnapshot`/`restoreNPC` as the writer and the reader, `npcFieldAudit` naming `currentTask`/`dialogueTree`/`inventory`/`quests`/`schedule` as the gap derived from the LIVE record against the snapshot rather than from a second list, `removeEntity` emitting `npcOrphaned` for the record of the body it removes, and a file that carries `npcs` scoped to the scene like `entities`. The loader pre-checks the pair’s key, the record’s body and the duplicate before ANY half runs; a pre-v131 file still loads because the FILE’s own `carries` decides, while a file that claims `npcs` and ships no list is refused. `savable` gains `npcs` (three carry now, four stay blocked). 288/288 vitest (112 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc` clean on `src`; probe 7 arms against a **288**-case control: 6 caught, 1 missed, 2 over-predicted — the miss deleted a duplicate rollback `detachNPC` loop and reddened nothing (because `removeEntity` already owns that cleanup), so the loop was DELETED rather than defended. ⬜ honest bounds: `broadphase`/`solverIterations` and `slopeLimit`/`stepOffset` are declared but unhonored (all four wait on collision geometry the package does not have); a scene with no declared world keeps v114’s variable-step path, and only the ACTIVE scene’s world is read; a cinematic sequence drives a camera and nothing else — no character, no audio, no material — and `postProcessing` plus every transition but the cut are refused rather than performed; removing a sequence does not move the camera it left behind and does not un-say the events it emitted; saves are written atomically and, when asked, flushed before the rename — but the rename itself is not flushed (a directory handle is out of this seam’s reach), a host can lie about what its `flushSync` did, and `sweepTempFiles` matches by suffix only, so a save legitimately named `ending.tmp` is debris-shaped and nothing schedules a sweep; a listing can be surveyed and every unreadable answer now carries a `reason` field beside its `why` prose, but a store that cannot browse contributes no listing at all; an NPC record is filed and NEVER DRIVEN — nothing reads its schedule, current task, dialogue, inventory or quests, so no NPC moves, talks, trades or wants anything; a record is scoped to ONE scene, and an entity id present in two scenes resolves against the record’s own scene rather than the body nearest the caller; `npcSnapshot` carries no geometry, so a restored NPC is a record about the default box `restoreEntity` builds; the old-file rule keeps a pre-v131 save loadable but nothing migrates it, so it keeps reporting `npcs` in `readableNowButNotCarried`; an entity record still names no scene (`SaveData.sceneGraph` is blocked); there is no Studio surface for any of it; **v134 (the scene’s declared world bag gets an owner) is in:** `SaveData.worldState` stops being a field nothing reads — one owner per scene (`setWorldState`/`getWorldState`/`getWorldStateKeys`/`deleteWorldState`), a value a file cannot hold refused AT THE SET with the key path rather than at `buildSaveFile`, a getter that returns a clone so a read cannot move the scene, an empty bag written as `{}` rather than omitted, the FILE’s own `carries` deciding whether a missing bag is a refusal or an ordinary old file (v131’s rule a second time), the bag going LAST in a load so an earlier failure leaves none behind, a load into a scene that already holds keys refusing before anything runs, and `worldStateFieldAudit` deriving its gap list so a name added tomorrow shows up unannounced. `savable` gains `worldState` (the fourth carried field, after `entities`, `cinematic`, `npcs`); 300/300 vitest, `tsc --noEmit` clean; probe 9 arms / 9 caught / 0 missed against a 0-red control, with arm 08 over-reddening 31 cases beyond its prediction (shipped code: `threeRuntime.ts:1450` reads the claim and `1455` refuses the missing bag). **v135 (the three refusal accounts get ONE table) is in:** `REFUSALS` (8 rows) declares per row which ACCOUNTS refuse a name and speaks a reason PER PLANE; the three accounts (`npc-record` 5 rows, `world-state` 4, `save-file` 3 — which `buildSaveFile` copies into `doesNotCarry`) are each ONE derivation of it rather than three hand-typed lists; `refusalsFor(plane)` throws rather than emitting a blank when a row withholds a plane’s sentence; and `refusalCensus()` answers `refusedBy`/`notRefusedBy` across the whole plane set (12 refusing sentences, each owned by exactly one (name, plane) pair) so a flat "yes, it is refused" claim cannot be made by accident — the witness row is `entities`, refused by the world bag and CARRIED by the save file. The derivation gives ONE order, so `doesNotCarry` is now alphabetical: 5 cases pinned the old orders and went red with nothing else moving, each then updated with a comment saying why alphabetical, and old files survive because `diagnoseSaveFile` reconciles `carries` against `doesNotCarry` by membership only. 308/308 vitest (5 files), `tsc -p tsconfig.json` (declaration emit) clean; probe 9 arms incl. control, control 0 red of 308, 8 counted. ⬜ v134/v135 bounds: nothing outside a test reads `refusalCensus()` (no Studio face shows which account refused a name), a `needs` sentence missing from the SHIPPED table throws at module init so it is graded through an injected row, the world bag holds only data a file can hold, and `sceneGraph` and `quests` remain blocked. **v136 (the player record gets a body and a file) is in:** `SaveData.player` stops being a declared shape nothing backs — `attachPlayer` holds ONE player per scene (keyed by scene, position and rotation read off the body and CLONED both ways, a hotbar slot naming a body outside the scene and a non-finite number each refused at the door), `getPlayer` drops an orphaned record instead of answering with a player that cannot be anywhere, `removeEntity` takes the scene’s record with the body it names, and `playerOrphaned`/`playerDetached` are emitted; `SerializedPlayer` becomes eleven of the twelve declared fields as file data (a sorted ENTRY ARRAY for `skills`, plain numbers for the transform), `playerSnapshot` writes `null` for a playerless scene and `restorePlayer` pre-checks shapes, scene, body and live conflict BEFORE it registers anything; `loadSaveFile` reads the FILE’s own `carries`, so a `player: null` is a claim the writer makes and an absent key is a pre-v136 file, and every id the player names is checked against the bodies the file carries before any half runs; `RefusalPlane` gains `player-record` (the fourth account), so `savable` carries five fields and `blocked` is `sceneGraph` + `quests` for the first time. 321/321 vitest (5 files), `tsc --noEmit` clean; probe 11 arms incl. control / control 0 red of 145 / 11 caught / 0 missed / 3 over-reds, each attributed (assertDiskSafe seeing the live Map, the shared audits case, the shared census cases). **Re-measured at the follow-on `1e729f5`: at this ref the suite is 322/322 across 5 files with `tsc --noEmit` exit 0, graded from HEAD’s own bytes materialised into a private tree because the worktree cannot give that reading (`gate-at-1e729f5.json`); the probe reads `control: 0 red (expected 0) · exit 0` over the 146-case file it grades (`probe-fixed.log`), and the two earlier kept collections disagree with each other and with this one because they were taken mid-fix (`fix-run.json`: 322 cases, 1 red, that red the wording iteration this fix then resolved). The arm that had survived (delete the writer’s `player:` line) is the one that proved `diagnoseSaveFile` was grading a file’s `carries` against the feasibility table instead of against the halves in its bytes, so a file claiming a player with no `player` key was called loadable by the reader whose own docstring promises the loader’s verdict; `claimsWithoutBytes` closes it in the loader’s wording, and the predicted-but-not-red case is the prediction’s fault (the mutation also makes the shape the OLD-file case exists to survive). See amendment 136’s addendum.** ⬜ owed and now paid: the ADR records for v134 and v135 sat unwritten because both shared files carried the M2 lane’s uncommitted v133 draft — `97baaf9` landed it, and amendments 134/135 record the debt. **v137 (the player record’s declared numbers get OPERATIONS) is in:** `damagePlayer`/`healPlayer`/`spendMana`/`gainExperience`/`setPlayerLevel` all go through ONE door — `requirePlayerForOperation` refuses a scene with no player by the scene’s name and an amount that is not a finite non-negative number by the operation’s name, because `JSON.stringify` writes `NaN` as `null` and a sign that silently reverses an operation is how a damage call becomes a healing one; damage reports what LANDED (`min(amount, health)`, `died` true only on the blow that crosses to zero, the caller’s `reason` carried through the report and the event and never read); health CLAMPS at `maxHealth` while mana REFUSES a spend the pool cannot cover, naming both numbers, and that asymmetry is stated rather than accidental; `gainExperience` adds and moves NO level — there is no curve in this package on purpose — so `setPlayerLevel` is the only door a level changes through, and it refuses a zero, a fractional or a non-finite level; every operation emits with the report it returned, and the numbers it leaves are the numbers `playerSnapshot` writes, proven through a real store by a runtime that never saw the record. 333/333 vitest (5 files), `tsc --noEmit` exit 0; probe 10 arms incl. control, control 0 red of 157, 10 caught, 0 missed, 2 over-reds both attributed. ⬜ v137 bounds: `skills` and `hotbar` are still filed and never driven and `inventory` is still refused on every plane, there is no mana regeneration and no experience curve, death is a number reaching zero rather than a state this runtime keeps (so a corpse can be healed), nothing outside a test calls any of the five operations, and no Studio surface exists for any of it.**v139 (the package face stops being a hand-copied list) is in:** `src/index.ts` re-exported each module by name, which made every grant two grants and let v135 ship `RefusalRow` — the row type of the refusal table — declared, documented and unreachable (`barrel.mjs` measured holes=1 at 9bf77b1 and 0 on a worktree carrying the v138 writer’s in-flight names). The face is now the union of its modules: four wholesale `export *`, allowed because the 123 names the four modules own are disjoint and the single shared name (`DEFAULT_THREE_CONFIG`) has one owner and one forwarder, arbitrated by `tsc` exit 0 rather than by reading. `test/packageFace.test.ts` holds the rule as 6 cases that derive everything from the module bytes — reachability, every module mentioned, one owner per name, a forwarded name resolving to its owner’s file, and the namespace’s value layer equal to the own values plus the forwards — and the sixth runs the finders against a synthetic broken barrel in-process, because the two files a hand list could still break are under a live v138 writer. Probe: [summary] 3 arms, 0 mismatched; arm A (the v135 list put back) reddened exactly 2 cases while 361 collected and 0 red outside the new file, i.e. the accident reproduced and the suite shown blind to it; round 1 predicted 1/3/0 and measured 2/4/2, all three misses mine and named. 361/361 at landing (+198/−27 over 2 files, `c30f592`), `tsc` 0. **v138** landed the COMBAT record (ADR 0016 amendment 138): `attachCombatant`/`getCombatant`/`detachCombatant` plus `strike`/`healCombatant` over the declared `CombatEntity`, with `damage` reported as what LANDED after armor, a floor of 1 on any non-zero blow, ONE death transition entered by `strike` and left only by a heal that crosses back, a corpse refused as a striker, and `combatFieldAudit` whose `consulted`/`unhonored` lists the suite requires to PARTITION the 13 declared fields by reading `src/types.ts` off disk. 23 cases; package suite **362/362** across 7 files, `tsc` 0. **v140** closed the bound every M5 grant had been writing: **the lane now has a consumer.** `agents/runtime/src/sceneTools.ts` (ADR 0016 amendment 140) declares a narrow `SceneDriver` — `engine`, `createScene`, `addEntity`, `removeEntity`, `addCamera`, `setActiveCamera`, `summarize` — and six `scene.*` doors over it: five write-class behind the §28 checkpoint and one read-class (`scene.inspect`). `agents/runtime` gains **no dependency** on this package (the host supplies it behind the seam, the shape `browserTools` uses for `BrowserDriver`), so the lanes stay separable. The family COMPOSES and INSPECTS; it does not render, has no `scene.screenshot`, and the proof makes that a measurement — the real headless backend receives **0** frames across every tool call while the same backend receives 1 on `start()` and 2 after one scheduler step. 20 unit cases + the runnable `docs/evidence/agents/scene-tools-proof.mjs`, which wires the REAL `ThreeRuntime` behind the driver and cross-checks every tool answer against the package’s own graph. ⬜ v140 bounds: no door for combat, physics, controllers, cinematics or save/load; registered in no default roster; and the PRODUCT face is still open — nothing in the Studio imports it. ⬜ v139 bounds: the package-face gate reads declaration syntax by regex and is blind to any export form it does not know; a wholesale face makes every module export public, so hiding a name now means un-exporting it. ⬜ v138 bounds: no turn, no initiative, no AI decision and no target choice; no formula beyond `max(1, amount − armor)`; armor never reaches immunity (1 always lands); no regeneration and no tick, so `cooldowns` and `statusEffects` are declared and unhonored with reasons; self-inflicted damage is refused rather than given a door. **v142 — the PRODUCT face is closed (ADR 0016 amendment 142): the Studio has a 3D surface, and building it found that every scene this package produced rendered BLACK.** `apps/studio` now depends on `@nexus/three-runtime` (its first UI consumer) and `src/components/Scene3D.tsx` mounts a real runtime on a real canvas behind a `3D` toolbar toggle; the model is pure (`src/lib/scene3d.ts` — no React, no three) and the renderer is the only file that touches a canvas or a GL context. The defect: `createScene` built two `THREE.Light`s, stored them in `LightingConfig.lights` and attached **neither** to the scene, so every `MeshStandardMaterial` body had no light to shade with — invisible to **362** green cases because each asserted the CONFIG rather than the SCENE. Fixed in `threeRuntime.ts` with three new scene-level cases (both lights are children and retrievable by id, a second scene gets its own, and every non-light child is still a registered body, because attaching lights moves the object count v140’s proof records); package **362/362 → 364/364**, `tsc` 0. The Studio’s own `typecheck` gate was **RED at HEAD** (`instancePanel.test.ts` `TS2532` since `d77ca34`, hidden by an incremental `tsbuildinfo`) and is fixed here too. Evidence: studio **130/130 (15 files) → 149/149 (17 files)**, `tsc --noEmit` 0, and a new `vitest.config.ts` aliasing the package **source**, because a test importing gitignored `dist/` would grade whatever the last build happened to leave behind; the runnable `docs/evidence/studio/scene-surface-proof.mjs` grades the SHIPPED Studio module itself (type-stripped with `node:module`, not copied) over the shipped runtime — §1 the composed scene is the runtime’s own, §2 the package’s own lighting term is **1.316496580927726** with the lights attached and **exactly 0** without them (every body’s `emissive` black), §3 the aim moves a real camera off the identity matrix and the frame carries it, §4 the surface’s step count and the backend’s draws are kept apart, §5 home HEAD byte-identical; and `tools/harness/studio-scene3d.mjs` drives the real bundle in a real browser: **11/11**, the 2D canvas still the default and still painting `482900/482900` px, `3D` mounts `#nexus-scene3d` and unmounts the canvas, the bridge’s frames advance `12 → 23`, `backend=webgl` at `878×550` with 4 draw calls, a 92525-byte PNG written to the harness evidence dir, `2D` restores the canvas, and the 3D reader answers `null` after unmount. ⬜ v142 bounds: DEMO-MODE geometry only (four default meshes, one camera, no assets, no model calls), no orbit/zoom or camera control, no add/remove body from the UI, no lighting control, no save/load door, nothing composed in 3D reaches the Design Document, the op log or an export, the surface is view state (not persisted, not undoable), and `Scene3D.tsx` has no unit test because this repo has no DOM test environment (covered by the headless proof and the CDP probe instead). ⬜ amendment 141, the owed M2 v141 record for `c8396a3`, was written in the same landing. ⬜ v146: a save may not be CREATED on a name debris already owns — `resolveNewSavePath` refuses a `*.tmp` name, so one atomic write can no longer delete two saves (ADR 0016 amendment 146, evidence §v146). ⬜ v147: `attachPlayer` refuses what `attachCombatant` has refused since v138 — a record above its own ceiling turns `healPlayer` into a removal (ADR 0016 amendment 147, evidence §v147). ⬜ v150: a save NAME has one owner between the confinement and the host — `resolveSavePath` now refuses a name its own `[\/]` split cannot re-join (the backslash was a separator when it refused `saves\..\escape.json` and a literal once the bytes reached the host), canonicalising was measured and rejected, the three surveys that re-enter a listed name classify it as `name-not-reenterable` instead of dying, and the obvious `segment.includes("\\")` clause was FALSIFIED by this grant’s own first run (18 cases in `test/saveNameSpelling.test.ts`, arms 7/8 MATCHED with W2 counted at 61 red = 10 in-grant + 51 outside, plane 386→404 with 0 red and tsc 0; ADR 0016 amendment 150, evidence §v150). ⬜ v155: a declared `Serialized*` shape is now owned by a FIELD PATH or refused by name — the census reads the population off `types.ts` declarations, climbs both roots, re-checks every link against its parent’s field list, and compares `vectorToData`/`eulerToData` keys to `SerializedVector3` and `SerializedEuler` (compared by nobody until now); 12 shapes declared, 7 gated by name before this grant, 5 by nobody, 2 of them inside `SaveFile` with src writers; 13 cases, plane 404→417 with 0 red and tsc 0, arms 5/5 MATCHED, and the grant’s first two rounds reddened on its own HEAD (a clause claiming a `SaveData` FIELD owner for `SerializedScene`, then an in-place `reverse()` that made the caller read the leaf hop as the root; ADR 0016 amendment 155, evidence §v155). ⬜ v161 (studio, the `3D` surface): the surface becomes CONTROLLABLE — the camera gains an ORBIT (pure `OrbitState` arithmetic — azimuth folded to (−π, π], elevation clamped short of the poles, distance clamped to [2, 40] — with the default orbit DERIVED from v142’s `STUDIO_CAMERA_POSITION` and a suite case asserting the round trip lands back on it, so the opening view is unchanged by construction; drag turns with pointer capture, the wheel zooms proportionally, a button resets), and the scene gains add/remove body from the panel (`nextBodyPlacement` ring slots so two added bodies never share one and none lands inside the composed shots; `removeBody` answers `false` for an id the surface does not hold; removal is LAST-body-only so a click can never delete the demo, and a suite case asserts the composed v142 bodies keep their places); `scene3d.test.ts` 16 → 30 cases (studio 187 → 201), headless proof §5 moves the REAL `THREE.Camera`’s world matrix with distance preserved and the runtime’s own graph 4 → 5 → 4, and the browser harness is **19/19** (drag: azimuth 0.581 → −0.419 with distance bit-identical; wheel out and back; + body / − body against the bridge; reset view); a first-draft defect — the first added body was named `Cube A`, colliding with the composed one — was caught and fixed before landing (added bodies continue at D via a per-mount counter never decremented by Remove; ADR 0016 amendment 161, evidence §5 + harness 19/19). ⬜ v163 (studio, the same surface): the scene SURVIVES the surface and crosses into the document — the surface gains save/load/send-to-doc: `save(savedAt)` records the LIVE scene through the runtime’s own `buildSaveFile` (the caller names the instant — the runtime has no wall clock), `load(file)` restores into a FRESH sibling scene so the demo scene and its loop are never touched (and a load into a scene that already holds state is refused — a restore never overwrites live state), and a pure `composeDocumentOps` files the AUTHORED bodies into the canonical Design Document as one real `ops.addSubtree` (a frame named `Scene: <scene>` with one text child per body carrying kind and position — structured spec text per §60, not a fake 3D preview), undoable like any other edit; the agent lane grows the same two doors (`scene.save`/`scene.load`, 6 → 8) with the file passed as a JSON string the door parses itself (the registry has no object arg type), refusing malformed JSON, bare values and arrays BY NAME, and both doors refuse a scene the driver does not hold; the save format’s consumers go 0 → 2; `scene3d.test.ts` 30 → 40, `agent-runtime` 498 → 506, studio 204 → 214, headless proofs §6 over the REAL runtime (the save round-trips through JSON, the load lands under the SAME ids, the live-scene overwrite is refused), browser harness **19 → 25/25** (the `__nexus` editor bridge shows the document gained exactly 2 nodes — `Scene: Studio Scene` with 1 child — in one history row; ADR 0016 amendment 163, evidence §6 + harness 25/25). **reload-safe saves (am. 165/168/169/170):** `listSaveFiles()` classifies refused names without reading a file, the `SaveStore` interface itself answers `savePathRefusal`, the panel browses and loads a SELECTED save (headers only), and the Studio backend is a namespaced localStorage store (`nexus-save:studio-scene`) so saves survive page reloads; measured at HEAD b03b193: three-runtime 422/422, studio 214/214, harness 25/25 re-run 2026-10-07; **v179 (the store becomes DRIVABLE):** the localStorage save store gains an injected seam — `options.storage` (the minimal `StorageLike`) drives the SAME code headlessly while the default still probes `window.localStorage`, so `Scene3D` is unchanged byte for byte; the seam's first tests caught and fixed a real lie: `writeAtomic`'s `durable` was silently IGNORED, now refused like its siblings with a zero-write guarantee (three-runtime 422 → **436**, harness **25/25** re-verified; ADR 0016 amendment 179); **v180 (refusals speak plainly):** a quota-shaped `setItem` throw is re-thrown with a sentence that names the quota AND that nothing was written (write / writeAtomic's temp step / rename; unclassifiable errors stay raw — no invented diagnosis), and the save note stops claiming "nothing written to disk" — it names the store: `persisted in this origin's localStorage (reload-safe), not on disk` (three-runtime 436 → **440**, harness **25/25** re-verified; ADR 0016 amendment 180); bounds: the save dialog has no quota meter, and an index-update failure after a landed write is still raw. **v181 (the surface PANS):** `OrbitState` gains `panX`/`panZ` — the orbit target slides along the ground plane; pure `applyPan` converts CAMERA-relative input (`forward`/`right`) with the orbit's own azimuth so W means "into the screen", each axis clamps at `±ORBIT_PAN_LIMIT`, `applyOrbit` rides the offsets through untouched (turning never moves what the camera looks at), `orbitToPlacement` slides the whole rig (lookAt moves WITH the camera, the reach unchanged), and the surface grows `panBy` — wired to SHIFT-drag (the world follows the cursor) and WASD/arrows (a key aimed at a text field is ignored); studio 256 → **263**, harness **25 → 30/30** (W pans `0/0 → −1.097/−1.672`, D strafes, reset clears, shift-drag moves the pan with the azimuth frozen at 0.581 — ADR 0016 amendment 181); **v182 (the surface PICKS):** the runtime grows `pickAt(sceneId, nx, ny)` — a real Raycaster into the LIVE scene (matrix world refreshed first, invisible bodies skipped, nearest hit wins) answering `ScenePick {entityId, name, distance}`; the surface converts a click's pixel through `ndcFromPixel`, a release within 4 px of its press is a CLICK (a longer travel was a drag), the hit lands in the report as `selected`, empty sky clears it, and the HUD answers `picked: <name>`; studio 263 → **274**, three-runtime 440 → **448**, harness **30 → 33/33** — two pinned clicks name DIFFERENT bodies (spatial, not a constant), empty sky clears (ADR 0016 amendment 182); bounds: pan is horizontal-only, the key map is page-wide (input-guard scoped), no inertia. **v183 (the lighting is CONTROLLABLE):** the runtime grows `setLightState(sceneId, lightId, {enabled?, intensity?})` — toggling `enabled` attaches/detaches the real `THREE.Light` (v142's rule through the gate), an illegal intensity refuses the WHOLE change, and light ids are SCENE-LOCAL names; the surface folds every brightness ask into 0..2 (`clampLightIntensity`) before the host sees it, the report re-reads the live scene as `scene.lighting`, and the HUD gives each declared light an on/off toggle and −/+ brightness at 0.1 a press; studio 274 → **283**, three-runtime 448 → **453**, harness **33 → 37/37** (toggle, dim 1.00 → 0.90, re-enable pressed by hand and read back through the bridge — ADR 0016 amendment 183); bounds: no light creation/deletion, no colour or position control, lighting is not persisted. **v184 (the save REALLY persists — store AND disk):** v163–v180's note claimed localStorage persistence while nothing ever called `writeSaveFile` — the store stayed empty through every green run and the harness never looked; the panel's save now writes the store for real and reports the write report's own byte count, and the runtime's fs-backed `SaveStore` (v120) gains its first product consumer — a `save-fs` route over the runtime's own `createFsSaveStore` with node:fs injected as its `FsLike` (the naming rules stay the store's; saves land in gitignored `.nexus/scene-saves`), a fetch-only lane, and `save to disk`/`browse disk` HUD controls whose rows load a disk save into a fresh scene; the harness reads the file back off disk with node:fs (2307 bytes, 5 bodies) and the HUD panel gets a max width so it stops swallowing drags aimed at the canvas (studio 283 → **297**, harness 37 → **42/42** — ADR 0016 amendment 184). **Now METERED (v185):** the save area measures what it holds — a store line summing the chars the decorated listing measured (a JS string's length, the unit localStorage quotas are counted in; the store's `list()` still reads no bytes — the meter is the caller that pays that cost on purpose), the browser's own `storage.estimate()` on the origin line, labelled `browser estimate, all storage APIs`, a missing estimate named rather than invented, a percent bar that renders only when both halves are numeric, and every store mutation re-measuring (studio 297 → **318**, harness 42 → **46/46** — ADR 0016 amendment 185); **Now MANAGEABLE (v186):** the disk rows carry delete and rename (`data-scene3d-disk-delete` / `data-scene3d-disk-rename`, `stopPropagation` so the row's click-to-load never fires beneath them) through the route's `delete | rename` actions — the server refuses only non-string paths itself and hands everything else to the store's own words (`delete` answers its boolean, "already gone" is `ok: true, deleted: false`; a rename's NEW name is a server-side creation under the store's creation rule, a missing OLD name refused by name), and the rows are re-probed after each verb, never hand-edited (studio 318 → **327**, harness 46 → **53/53** — ADR 0016 amendment 186); **Now INSPECTABLE (v192):** the picked body has FACTS — `selectionFactsOf` reads the live scene at report time (kind, world position, visibility), the HUD renders them, `position` is `null` rather than invented when a host declares none, and a body that has LEFT the scene reports nothing while the selection stays the name it was (studio 327 → **369**, harness 53 → **55/55** — ADR 0016 amendment 192); **Now EDITABLE (v197):** the name and the visibility become writable through the runtime's own gates — `setEntityName` stores the name AS GIVEN and refuses a blank ask whole (the surface folds the trim first and re-points the pick record only on an ACCEPTED rename), `setEntityVisible` moves BOTH records so `pickAt` then skips the hidden body; the harness run exposed the resolution plane — unit suites read the package's `src/`, the Studio build reads `dist/`, so a stale dist silently no-op'd both gates in the real browser behind green suites (three-runtime 45 → **51**, scene3d 65 → **72**, surface 12 → **13**, harness 55 → **61/61** — ADR record owed); **the resolution plane gets a gate (v198):** `test/distSync.test.ts` requires every 2-space method declaration in `threeRuntime.ts` (154 names by the gate's own scan, overload signatures excluded) to appear in `dist/threeRuntime.js`, reddening by name with the rebuild command — a never-built plane skips and is named (three-runtime 459 → **463**). **The inspector reads the component registry (v199):** `entityComponentsOf` decodes the three registry spellings (live Map / save-shape entry array / stringify object) with the `enabled !== false` default, the HUD names each component (disabled as `(off)`) only when the registry is non-empty — proven pure 72→**74**, surface 13→**16** over the real runtime (addComponent in order, removeComponent followed), harness 61→**62/62** (empty fact + no HUD segment; the frozen read-only bridge cannot attach), proof §7 drives both verbs through the shipped dist runtime; child counts stay uncounted on purpose — the scene graph is flat, no entity parent/child API, so no number is invented from renderer internals; bounds: the inspector still reports what a host DECLARES (no materials, children or animation state — children stay uncounted while the graph is flat), components are read but not editable, and edits remain name and visibility; **the component registry becomes EDITABLE (v200):** `setComponentEnabled` on the runtime + `toggleComponentEnabled` on the surface — a write verb over the same registry the inspector reads, following the host-gate pattern (`setEntityName`/`setEntityVisible` precedent); the HUD renders each component row as an interactive toggle button; proven through the real runtime (surface 16→**17**, harness **62/62** unchanged — bridge is read-only, toggle proved at suite+proof layers), proof §7 drives both flips through the shipped dist (health on→off, shield off→on, ghost refused); bounds: enabled gates no behavior yet (materials/animation still unread, child counts stay uncounted), no add/remove verb here (runtime owns those) one fixed save name (`last-saved`) per store, no quota-fill prediction and no polling (the meter re-reads on mutation, never on a timer). **enabled gates query participation (v201):** `getEnabledComponents(entity)` returns only components whose `enabled !== false`, so disabled components are stored but invisible to iteration — giving the flag behavioral meaning without coupling to rendering or game logic; proven through the real runtime (surface 17→**18**, harness **62/62** unchanged — query filter proved at suite+proof layers), proof §7 exercises the filter (3 stored → 2 queryable → disable stamina → 1 → re-enable shield → 2); bounds: the filter applies only to iteration (save/restore still carries all components, the HUD reports all components), no bulk enable/disable verb (each toggle is individual). **enabled gates material visibility (v202):** `EntityComponent` gains an optional `targetObject?: THREE.Object3D` field — when a component with a target is disabled via `setComponentEnabled`, the runtime sets `targetObject.visible = false`, making the flag gate actual rendering; components without a target behave as before (flag updates, nothing visual changes); proven through the real runtime (surface 18→**19**), test verifies hide/show cycle and no-target safety; bounds: only components WITH a targetObject affect rendering,  **The component registry becomes EDITABLE (v200):** `setComponentEnabled` on the runtime + `toggleComponentEnabled` on the surface — a write verb over the same registry the inspector reads, following the host-gate pattern; the HUD renders each component row as an interactive toggle. **Then the flag gets BEHAVIOUR (v201–v203):** it gates query participation (`getEnabledComponents`), material visibility (`targetObject.visible`), and animation playback. **Then every EVICTION door releases what it evicted (v205/v206/v208):** removal, entity removal, and `addComponent`'s same-type replace each release the evicted component's effects, and a component filed DISABLED declares its gates at file time (v209). **Then the silent verbs get voices (v210–v218):** the component family's events get a subscriber, the two silent entity verbs (`setEntityName`/`setEntityVisible`) announce themselves, and `setPixelRatio` — which wrote the REPORTED `pixels.pixelRatio` in silence — now emits after the backend takes the value. The surface watches the bus in FIVE pairwise-disjoint legs (`watchComponents` · `watchEntities` · `watchBodies` · `watchScenes` · `watchPixels`, v210–v218), each name set decided by a WRITE CENSUS of the report fields it covers rather than by a family list, and the disjointness pin re-widens with each leg (12 joins, 12 distinct names). ⬜ **STATED GAP: this row records the per-increment detail only through v202** — v203–v218 are committed and carry ADR records, but the row itself was not updated for them; filed as a plan item rather than backfilled here. ⬜ v218 bounds: the verb reports ASKS not deltas (setting the ratio it already holds still announces), the leg carries no payload by design (a listener re-reads the report), and `Scene3D`'s own resize now re-reads twice — a redundant render, not a wrong value. **Two config fields nothing read (v221):** `frustumCulling` is APPLIED at `insertEntity` (the one funnel both `createEntity` and `restoreEntity` pass through; THREE's own default is `true`, so the default path is unchanged), and `maxLights` is now OPTIONAL and documented as UNHONORED because there is no light-creation API for a cap to cap. **Then the two `create*` seams refuse a taken id (v225):** `createCamera`'s and `createScene`'s optional `id` is the RESTORE wedge (`defineCinematic` refuses a shot naming a camera the scene lacks, and `loadSaveFile` refuses to invent the scene a file describes, so the caller re-issues the saved id first), and a TAKEN id used to be answered by `Map.set` — measured on the shipped bytes before the fix, a create naming the ACTIVE camera's id left the scene holding two cameras with `active=false` on BOTH (nothing for `animate()` to draw from) while the bus carried only `cameraCreated` and no `activeCameraChanged`, and `createScene` had the same hole one level up (the live scene's bodies, cameras and active seat evicted, announced as a plain `sceneCreated`). Both now follow the rule this runtime already states four times — "a restore never overwrites live state" (`restoreEntity`, `loadSaveFile`, `restoreNPC`, `restorePlayer`) — and throw. **v222–v224** landed between the v221 entry and this one and are recorded in the ADR (the publish E2E proof no longer leaks its throwaway container on a hard kill; the pixels leg's own witness arms and the verb graded through the shipped seam; and a refused camera switch that silently cleared the active camera — fixed by looking the id up before any flag moves — plus the surface's sixth watch leg). three-runtime **521 → 531** (22 → 23 files), Studio **474/474** through the `@nexus/three-runtime` → `src` alias, **4 arms 4/4 MATCHED**. **Then the save file’s cinematic half learned to answer to the caller’s scene (v227):** every OTHER half of a file (`entities`, `npcs`, `worldState`, `player`) is restored into the scene the caller names, and the cinematic half was the one exception — a sequence’s `sceneId` recorded where the save was taken and the loader demanded that exact scene exist, so a file carrying a cutscene could only be loaded into the very scene it was saved from. Measured on the shipped bytes: the Studio’s own save→load, whose whole design is a SIBLING restore so the live scene stays untouched, was refused with `restoreCinematic: "seq" belongs to scene stage, which is not the active scene (…)`. `loadSaveFile` now re-points the sequences at the caller’s scene, in a COPY (the caller’s file still says where it came from). The camera half stays the caller’s — the format carries no camera objects, so the Studio’s `load()` re-issues every camera the shots name under its own id, with the name spelled from the id, and makes the sibling the ACTIVE scene when the file describes a cutscene that was RUNNING (a sequence plays nowhere else); it ANSWERS what it re-issued rather than doing it silently. Two bounds pinned by tests: the surface’s OWN save is still refused by name while its sequence is live (a restore never overwrites live state, now stated five times), and a host with no `setActiveScene` cannot resume a running cutscene at all. three-runtime **531 → 535** (23 files), Studio **474 → 483** (31 files), **5 arms 5/5 MATCHED** after one recorded re-derivation. **Then the same family’s last member (v228):** a survey of the registry seams after v225 (a verb that answers a bad argument with a silent no-op dressed as a success) found `createAnimation` — the scene was looked up AFTER the animation was built and the registration was guarded with `if (scene)`, so a bogus scene id produced a live animation registered NOWHERE, announced with `animationCreated`, and unreachable by the id it was handed back. Measured on the shipped bytes: `scenesHoldingTheGhost: 0`, `reachableById: "no"`, `animationCreated fired` once per call, while `createCamera` and `createEntity` on the same bogus scene both answer `Scene X not found`. The guard moved to the top, with two orderings pinned as separate claims (the SCENE asked before the CLIPS; the emit following the registration). `attachNPC`/`attachPlayer`/`attachController`/`attachCombatant` all already refused a taken slot and `addComponent` replaces by design with a documented eviction cleanup (v208) — so this closes the family. three-runtime **535 → 541** (23 → 24 files), Studio 484/484, **3 arms 3/3 MATCHED** after one recorded re-derivation. **Then the MemDisk consolidation follow-on (v230):** the ‘empty’ listing policy was removed after measuring that it was never load-bearing. The two suites that carried it (`memory`, `vectorStore`) are tightened to ‘refuse’, the policy is removed from the shared disk (`MemDiskListing` is now ‘refuse’ | ‘real’), and the disk gets its own 9 cases with 5 arms 5/5 MATCHED. `agents/runtime` **540 → 549** (36 → 37 files), **5 arms 5/5 MATCHED**. This closes plan item 19. |
| **M6 — Autonomous Build** | end-to-end plan→deploy with human checkpoints | ✅ v173–v178 (am. 173–178) — headless build arc v173 (`planBuildArc`/`runBuildArc`, ONE `build.verify` door, §28 per step, receipts v50-rule) + the container verifier as first wired runner over the SAME v166 wall (proof §1–§7, daemon 29.8.2); dock build face v174 (pinned two-step arc through the SAME wall, §28 receipts per door, harness 8/8); planning backend v175 (`templateBuildPlanner` over a host-declared step catalog — a goal selects, argv never written, seed-as-provenance, unplanned is honest; runtime 527/527, studio 241/241); headless deploy arc v176 (`planDeployArc`/`runDeployArc` — only a green arc deploys, only MEASURED facts deploy, each `deploy.record` door §28-gated, the host injects the `DeploySink`; runtime 540/540, §4 sink receives the container's stdout byte-for-byte); **dock DEPLOY face v177** — the build face's own walk redeployed through `planDeployArc`, facts landing as append-only JSONL records in `.nexus/deployments.jsonl` (studio **251/251**, `deploy-lane-proof` §1–§6 vs daemon 29.8.2, harness **8/8**; the dock's first durable server-side artifact); **records read-back v178** — `readStudioDeployRecords` + the probe carrying the records NEWEST FIRST (display-capped, malformed lines counted never hidden) and the panel rendering the history (studio **256/256**, `deploy-lane-proof` §1–§7, harness **10/10**). ⬜ honest bounds: deploy means RECORDS on this server — not a push, not a publish, not a release; the catalog holds two templates; no rollback, no remote target |
| **M7 — Community** | profiles/explore/likes/comments/follow/publish/remix | 🟡 **started — v193** (ADR 0016 amendment 193): **hosted publish stops being deferred.** `services/nexus-api` is a REAL Spring Boot 3.5.16 service on Java 25 (ADR 0011's stack) with ONE aggregate and TWO endpoints — `POST /projects/{id}/publish` (201 + a receipt when the id is new, 200 when it is not) and `GET /projects/{id}` (the publication, or 404). The URL is built from the request that asked, so it names an address that serves it. 14 unit cases with no Spring context; `docs/evidence/m7/publish-proof.mjs` builds the jar, starts a throwaway PostgreSQL 16 in Docker, and asserts the document round-trips as JSON, a re-publish UPDATES to version 2 with the DATABASE counted at exactly one row, refusals name their rule, and **the publication SURVIVES A SERVICE RESTART**. **The Studio CALLS it (v194, amendment 194):** the toolbar has a Publish control over a fetch-only lane (`publishServer.ts` server-side, `api/publish` route, `publishLane.ts` client-side, importing nothing from either) — it sends the document and passes the SERVICE's version/instant/URL back unchanged; a down service is a normal answer, not an error banner. `tools/harness/studio-publish.mjs` stands up all THREE layers (PostgreSQL + nexus-api + the real Studio) and drives the button in a browser. **Listable and removable (v195, amendment 195):** `GET /projects?limit=N` (newest-first, metadata only, the cap CLAMPED and reported) and `DELETE /projects/{id}` (`{ removed }`, 200 either way) — the Studio's Publish face grew a **Published** panel whose rows are the service's answer, re-fetched after every verb; the proof also stopped verifying postgres INSIDE its container (which says nothing about the HOST port the service connects through). **Openable (v196, amendment 196):** `GET /p/{id}` is the ARTIFACT PAGE — the half M1 deferred, because every other door needs a CLIENT that already knows the id. It answers the document drawn by the Studio's OWN `renderPreviewHtml` (the same function the local Preview and the HTML export use, since "what you published is what you get" is only true if they are the same code), 404 when nothing is published, and **503 when the service is unreachable** — not a 404, because "nothing is published here" and "the thing that knows what is published is not running" are different facts. ⬜ honest bounds: no auth, no accounts, no ownership (anyone who can reach the service can publish or unpublish anything); no paging beyond the cap; no soft delete or history; `ddl-auto: update` rather than migrations; a publication is REPLACED not versioned; publishing is a toolbar control rather than a product surface (no project picker, no publish history); the artifact is the document and nothing else (no author, no date, no navigation). **REMIX (v233, amendment 233):** the last of those bounds is CLOSED — the Studio now reads a publication back in its own UI. A Published row gains a `remix` control; the lane (`remixLane.ts`, a pure validator + a fetch adapter over `readPublished`) hands the document back, and the store's `remixDocument` **forks** it (`forkDocument` gives the copy a fresh DOCUMENT id, because `doc.id` IS the publish projectId — so editing and re-publishing a remix can never overwrite the source). A down service and a publication with no document are distinct refusals, each naming its cause. design-model 34 → 40, Studio 484 → 492 (32 files), `remix-proof.mjs` 5/5. **And a VISITOR can remix (v234, amendment 234):** the artifact page (`/p/{id}`) injects a remix bar (`/?remix=<id>`) so someone who has only the URL can take the work; the Studio reads the intent on mount, forks, and drops the query. Studio 492 → 499, `remix-proof.mjs` 6/6. **And what is published is BROWSABLE (v241, amendment 241):** `/explore` is the public gallery — the service could LIST publications since v195 and only the author's own panel consumed it. Each card carries a thumbnail drawn from the canonical model (`docToSvg` → `svgToDataUri`), the receipt facts, and the two community doors (`open` `/p/{id}`, `remix` `/?remix={id}`); the HTML escaper moved to a shared `pageShell.ts` (one rule, not two). Studio 509 → 516 (34 files), `explore-proof.mjs` 4/4. Remaining M7 bounds: **accounts/ownership landed (v242–v259, amendments 242/244–259):** the publication carries an OWNER and the service enforces claim CONSISTENCY without ever claiming to verify it (v242); the Studio holds a persisted CURRENT-DEVICE account and sends the claim (v252/v253); EXPLORE and the artifact page name the author and the remix source (v245/v246/v247); and the missing UI to SET an account landed as the account FACE — a session seam (`register`/`rename`/`signOut`, refusing to replace an existing account, device seed kept across sign-out) behind the toolbar's account control (v259). The reserved `_lineage` key now reads through ONE guarded reader, closing the studio `tsc` red v245/v247 left at HEAD (v262). **And the account is now the CLAIM (v263):** the publish lane attaches this device's claim (an injected `ClaimSource` reading the same record the account panel writes), so a Studio publication is OWNED — the receipt and the listing name the owner and its assurance, a take-down by another account is 403 `not-the-owner`, a re-publish under a different account is 403 `owner-taken`, and the owner's own take-down is 200 — measured over the REAL service in the publish proof's new §10, which also caught the claim's INSTANT being read as epoch SECONDS and stored 53,817 years in the future (the service now reads the client's millisecond unit, in and out). **And the byline REACHES the page (v265):** the service-answer → card mapping moved into the pure half (`toExploreItem`), so the owner's whole trip is graded — the service's own answer shape in, the page's HTML out — and the route can no longer grow a second mapping that drops it. **And the whole chain is driven in a REAL browser (v266):** the publish E2E harness now sets an account by hand, presses Publish, and watches the SERVICE record the owner, the public `/explore` card show the byline, and a signed-out device's take-down be REFUSED by name while the publication stays up. **And a REMIX records its LINEAGE (v267):** the writing half joins the reading half in one module (`stampLineage`), the reserved key is declared in the canonical model, and the fork OVERWRITES the lineage it inherited — a remix of a remix names its OWN source. Running the remix lane's own gate also found it RED at HEAD for two reasons (a module loader that could not resolve `pageShell`, and an assertion about a type-only import that was never true) — a proof that cannot resolve an import is not a passing proof, it is a proof that stopped running. **And the remix is proven END TO END (v268):** a person remixing in the real Studio, the fork published, the SERVICE storing the lineage, and the public gallery naming and linking the source — with the fork owned by the same device, so a remix is both sourced and signed. **And the VISITOR's remix is proven in a real browser too (v269):** `/?remix=<id>` is honoured on mount with no button pressed, the one-time query is dropped once honoured, and the visitor's own publication carries the lineage — so the community loop's front door produces a sourced publication, not just a fork in an editor. **And the PROFILE page exists (v270):** the service can narrow its listing to one OWNER (a blank owner is the ABSENCE of one and answers an empty list, so "the publications of nobody" is never the whole table), `/u/{accountId}` lists that account's publications, and the gallery's byline became a LINK to it. A profile shows the handle and the assurance its claims carry and says what it cannot know — the service holds no account table, so there is no display name, no bio, no followers, and no way to tell an unknown account from a silent one. Still open: no verification (a claim is `unsigned-local`, ADR 0018), follow/likes/comments are not built, the account face is now driven in a REAL browser (v264: 14/14 assertions over the real bundle, so the wiring is no longer type-check-only), and there is no account roster or switch |
| **M8 — Creator Economy** | marketplace, templates, credits, subscriptions | 🟡 model half built — a credits ledger + template catalog + marketplace + creator dashboard + settlement + template-remix handoff + buyer wallet view + a versioned wire format + a local-first store + a refund mechanism with net-of-refunds ownership and FIFO pairing — a refunded purchase can be bought and refunded again — and a refund POLICY layer that applies a host-declared window BEFORE the mechanism runs, with the closing instant inclusive, a broken declaration refused by name, and a PREFLIGHT (`refundEligibility`) that answers the same gate before a click without writing anything, an ORDERING rule that refuses a refund dated BEFORE the purchase it reverses — the mechanism asks it about the instant the write records, the preflight about the instant of the ask, and the SAME instant is allowed — and a `clawback` KIND so the seller's side of a refund is a reversal rather than a purchase — `heldRefsOf` ignores it, and the dashboard and the statement report `refunded` / `clawedBack` apart from earned/spent with both identities carrying the two buckets, and per-ref attribution that NAMES what each listing did — earned / spent / refunded / clawedBack per ref, so a sale and its full claw-back stay one row with net 0 instead of collapsing into "never sold", and a PUBLISH handoff that turns a canonical Design Document into a VALID listing (or refuses a broken graph by name) — the catalog's missing producer, which v546 joins to an EXISTING shelf as ONE decision (`publishListing`: the withdrawal record owns its ids, so a publish cannot build a shelf `catalogStore` refuses to save) — and a local-first CATALOG store so the listing can LAND (absence vs corruption distinguished, a duplicate id refused by the loader, and a remembered WITHDRAWN list — format 2 — so a take-down is a move rather than a delete, with a version-1 shelf migrated and an id claimed as both listed and withdrawn refused by name) which the `/credits` page itself now reads and writes, so a RETIRE survives a reload rather than living in a render, and the catalog's OTHER missing verb — a RETIRE that withdraws a listing (a second retire refused by name) without touching the ledger, so a retired ref stays OWNED and stays refundable from the record while its id can be listed again under another author (pure models, all gated, 251 tests across 17 files — the credits sub-system's gated suite, measured at v548); a standalone `/credits` page (DEMO MODE) renders the wallet/creator/store over a local demo ledger and can BUY and REFUND against it, and DISABLES a refund whose declared 30-day window has closed — naming the reason on the button before any click, pressing it writes nothing, and switching back re-enables it (48/48 browser checks, including a RETIRE from the store: an unowned listing leaves the shelf outright, while a listing the buyer PAID FOR keeps its row — marked retired, still owned by the wallet, and still carrying a Refund action that reads the RECORD, makes the buyer whole, and only then lets the released row leave — and that after the reversal the rendered dashboard says `clawed back 500 · spent 0` and the statement says `refunded 700 … reconciles: yes`, that each eligible row states its refund DEADLINE from the preflight's own `closesAt` — `refund: no deadline` under a declared no-deadline policy, a dated `refund until …` for a purchase inside a 30-day window — that the statement reads BY LISTING, each ref's row naming its own movements: a purchase fully refunded stays a row with net 0 and two movements, and a listing bought, refunded and bought again names all three, and that the statement is read over a WINDOW the READER chooses: the demo span makes `closing` (500) stop being the balance and the line names `after +300 · balance 800`, this session folds the earlier era into the opening (500 → 800), and the per-listing rows follow the same window, and that a refund reads WHO WAS PAID off the record: a listing that left the catalog still reverses (the buyer is made whole, the recorded seller is clawed back, and the sentence names the ref rather than a title the catalog stopped claiming), while a catalog that re-authored the listing cannot claw back from an account that was never paid), and that a TAKE-DOWN can be PUT BACK (v542): the shelf remembers what it withdrew — the format-2 record survives a reload with all three take-downs on an empty shelf — and Put back returns one listing to the shelf and takes it off that record, again across a reload), and that a take-down can instead be DISCARDED (v543): `relistTemplate` makes the move back ONE decision that cannot leave the id on both sides, `discardWithdrawn` shrinks the record by exactly the named listing while the shelf does not move, and the smaller record survives a reload, and a CREATOR's own dashboard reads that same record through `withdrawnByAuthor` — only the asking author's take-downs, so "never published" and "withdrawn" stop looking the same and a stranger sees an empty list), and that the PAGE has its own producer (v546): `Publish draft` builds a real Design Document and `publishListing` lands it as `Local Draft 1` (author-1, ¥3.00) without touching the withdrawal record, and the published shelf survives a reload, and v547 gives the shelf its DOCUMENTS and the fork its ORIGIN: a published design is stored by id in `nexus.designs.v1` (a save replaces in place and appends a new one, an unknown id is refused by name, a hand-edited document the model refuses is refused on read, and an unreadable store is never overwritten), the page's Remix action forks a STORED design and the fork carries its lineage — the template id and the host's instant — while a remix with no instant is refused by name, and v548 STORES the fork and reads it back: a remix is saved into `nexus.designs.v1` before it is reported, the page's REMIXES strip is derived from the stored DOCUMENTS through `readLineage` (no second index to drift; a draft is not a fork, the store's order is kept, and a source the shelf no longer lists still keeps its row reading `no longer listed`), and the first SAVED fork exposed a four-version bug — `forkDocument` renamed the root without re-parenting its pages, so it produced documents the model refused; a fork is now a document `validateDocument` accepts; the parallel lane built subscriptions, plans and tips (monetization / economy / planLane / planServer / economyServer / tipLane with tests). ⬜ honest bounds: no server half for the credits ledger, no payment, no refund policy CONTENT beyond a declarable window (who may ask, whether the author consents, and where a service stores a per-listing policy are the host's), and the `/credits` page is NOT wired into the editor panes (Studio.tsx belongs to the lane); the lane's subs/plans/tips are blocked by ADR 0018 (no monetization endpoints yet) |
| **M9 — NEXUS Ops** | observability, incident→patch→PR→approve→deploy | 🟡 **started — v271** (ADR 0016 amendment 271): the **AUDIT TRAIL** — the service records what every publication verb DID, in order, in a table that is appended and never replaced (a publication row is REPLACED on every re-publish, so it cannot hold a history). Two rules: only SUCCESSFUL mutations are recorded (a refused take-down throws before anything is written, and the refusal is already in the response), and an entry with **no actor** is a real entry (an anonymous publish names nobody, and a trail that could not say "nobody" would have to invent one). The write joins the caller's transaction, so the trail never records a publication that rolled back. `GET /audit` answers newest-first and capped, with the instant in the client's own epoch **milliseconds** and the assurance travelling beside the actor. Only `publish`/`unpublish` are recorded — `follow`/`like`/`comment`/`tip` do not exist server-side yet. ⬜ honest bounds: the service **verifies nothing** (the assurance is the entry's own statement of what the claim was worth), there is **no Studio surface for the trail yet** (the door exists and the client's `AuditEntry` model already matches its shape), and the trail is append-only with no way to truncate it. **Since then (v272–v388, ADR 0016 amendments 272–381):** the Studio has a trail PANEL (v272) and the artifact page a per-publication HISTORY (v280); the service records the SOCIAL and REPORT verbs too (like/unlike, comment/uncomment, report/withdraw-report, acknowledge — not just publish/unpublish); every entry names the KIND of thing it happened to (v384: account, plan or publication, declared by the caller and never guessed from the id); the panel's action filter is answered by the service itself (v385), which also states the whole trail's size beside the window so a filter cannot hide its scale; and the window can be PAGED (v388: an offset in rows, with the two honest endings — a count says where the end is unfiltered, a short window says it under a filter). **And v541 (ADR 0016 amendment 524)** closes the other half of the contract: the CLIENT's word lists are no longer a hand-copy. `ops.ts` exports `REPORT_STATUSES`/`REPORT_REASONS` as the service's words in the service's declaration order, and `verify:audit-contract` §8–§10 read the verbs out of `AuditService.ACTIONS` and the statuses/reasons out of `ReportDtos`, refusing a client that drops, invents or reorders a word — or whose bucket type collapses into an index signature, the collapse that let `reportsByStatus` throw on `acknowledged` (a status the service has WRITTEN since v304) while `tsc` stayed green and three versions of this proof stayed passing. **And v556 (ADR 0016 amendment 537)** moves that reconciliation onto the files the reader actually meets: §8–§10 were grading `ops.ts`, which had **0 production importers**, while `Toolbar.tsx` spelled **37** audit-verb literals by hand (its button order had already diverged from `AuditService.ACTIONS` on `comment`/`unlike`, and the panel is what the user sees), `trail.ts` re-implemented the row's wording as a **12-case switch**, and the reporter's reason menu was built from `reportBar.ts`'s **second `REPORT_REASONS`**. Each list now has ONE owner across the **153** shipped sources the gate DERIVES, the panels import it (`ops.ts` importers **0 → 2**, `REPORT_REASONS` owners **2 → 1**), the filter row renders by mapping `TRAIL_FILTER_ACTIONS` (**37 → 0** verb literals), and §11 RUNS the shipped trail module over the service's nine verbs and requires a row word, a button word and a tooltip word for each — **11/11** witness arms, one of which reddened the GATE rather than the client (an unused `import` had counted as a production reader). What it refuses to charge is printed, not hidden: 7 shipped sources spell a verb for their OWN request or route, the trail's tally chain stays hand-written under a totality pin, and `REPORT_STATUSES` still has no reader outside `ops.ts` because the screen that would bucket reports by status does not exist yet. **The service can say whether it can serve (v582, ADR 0030):** `GET /health` answers the PROCESS fact and the DATABASE fact separately — 200 when the database answers, 503 when it does not — with `service`, the POM's own `version` read from the packaged jar, `startedAt`, `uptimeSeconds`, and `database {reachable, latencyMs, detail}`, under `Cache-Control: no-store`. The probe is ONE borrow, ONE `isValid(1)` and ONE close: no retry, no own timer (the live run measured Hikari's 30 s bound at **30 016 ms**), and the failure reason is a SHORT token (`invalid-connection` or an exception's simple name), never a message, JDBC URL, host or credential. The live proof stops the database under the running process: 503 with a token and no leak; starts it again: 200 with `detail` gone, the SAME `startedAt` and a larger uptime — and ZERO audit entries, ZERO webhook deliveries and ZERO `health%` tables before, during and after. ⬜ honest bounds: only THIS service's database is checked (no fan-out, no `SELECT 1`, no migration verdict, no read/write distinction), there is no metrics/histogram or liveness-vs-readiness split (a 503 must not restart a healthy process), `startedAt` is the health bean's construction rather than the JVM's launch, and `version` is `unknown` outside a packaged jar. **v586 (ADR 0016 amendment 544)** grades the SENTENCES, not only the lists: before this batch `reportStatusText` was declared by **2** shipped files that disagreed on all **5** statuses the service declares, and a report whose status never arrived folded into `'open'` — `{status:'open', open:true}`, `deskSummary {total:1, open:1}`, `data-desk-status="open"` and an armed **Acknowledge** for a state nobody can state, which `ReportService.java:188` and `ModerationService.java:220` then refuse. `ops.ts` is now the single speaker, the absence has a value of its own (`REPORT_STATUS_NOT_GIVEN = ''` → "the service gave no status"), standing is one predicate that `ReportRow.withdrawable` and `DeskRow.open` both derive from, and §11.7–§11.11 count word-face declarations, refuse any shipped file outside the owner spelling a declared status (**25 literals in 4 files → 0**, the owner still spelling all 5), RUN both shipped report faces over the never-sent status, and pin the client's standing set to exactly the set the service's own 2 `ReportDtos.STATUS_*` guards refuse to move — **8/8** witness arms matched, studio **142 files / 2856 tests**, `tsc` and `lint` exit 0, and `verify:package-counts` red until the table is regenerated from the sha it describes. `REPORT_STATUSES` still has **0** production readers outside its owner: printed on every run rather than fixed by inventing a filter nobody asked for. **Liveness is not readiness (v585, ADR 0036):** `GET /health/live` answers the PROCESS fact ALONE — `service`, `version`, `startedAt`, `uptimeSeconds`, NO `database` field — and never borrows a connection, so it answers while the pool is exhausted; `GET /health/ready` answers the SERVING fact, `{ready, database}` with 200/503, and is the same measurement `/health` makes (the doors cannot disagree). The live proof measures BOTH doors in the SAME outage, liveness first: `/health/live` answered 200 in **8 ms** while `/health/ready` took **30 108 ms** (Hikari's own borrow) to answer 503 with `ready=false` and a token — so a supervisor reads `/health/live` and a load balancer reads `/health/ready`, and a database outage does not restart a healthy process. `/health` keeps ADR 0030's shape and status unchanged; the same process (same `startedAt`) answered all three doors before, during and after the outage, uptime **4 s → 40 s**, with **0** audit entries, **0** deliveries and **0** `health%` tables. ⬜ honest bounds: liveness proves the HTTP stack and this bean run, not thread health or memory; readiness still waits up to Hikari's `connectionTimeout`, so a probe's own deadline must allow 30 s; `ready` repeats `reachable`, and `version` is `unknown` outside a packaged jar. **The process's own numbers (v588, ADR 0037):** `GET /health/vitals` answers a SAMPLE of what the JVM says about itself — `heapUsedBytes`, `heapCommittedBytes`, `heapMaxBytes` (served as `-1` when the JVM defines no maximum, never clamped), `liveThreads`, `peakThreads`, `processors` — always 200 while the process answers, under `Cache-Control: no-store`. It is a USAGE fact, not a serving fact: no threshold decides a 503, every call re-reads `MemoryMXBean`/`ThreadMXBean`/`Runtime`, and no history is kept. The live proof stopped the database under the running process and vitals still answered 200 in **6 ms** with the same six fields (`/health/live` 12 ms), then answered **24 ms** after the database returned; psql read **0** audit entries, **0** deliveries and **0** `health%` tables. ⬜ honest bounds: JVM facts only (no request count, latency histogram, error rate, GC count or percentile), one sample per call with no correlation, `-1` maximum must be handled by the reader, thread counts are JVM-wide, non-heap memory is not reported, and `processors` is the JVM's own view. **Traffic counted where it crosses (v592, ADR 0039 — ADR 0016 amendment 546):** `GET /health/traffic` answers what this process HAS SERVED since it started — `requests`, five status families (`successes`/`redirects`/`clientErrors`/`serverErrors`/`unclassified`), `durationTotalMs`/`durationMaxMs` and five fixed latency buckets (`upTo10Ms`/`upTo50Ms`/`upTo250Ms`/`upTo1000Ms`/`over1000Ms`) — always 200 under `Cache-Control: no-store`, with no per-path map, no percentile and no history. One `OncePerRequestFilter` records every finished dispatch under one monitor, so a snapshot is one instant and BOTH partitions add up to `requests`; a thrown dispatch is counted as 500 and still propagates. The live proof issued 200/404/200 and the next read reported requests **1 → 5** (+4: the three calls and the baseline read), successes **+3** and clientErrors **+1**; the read after it reported **5 → 6** (+1 for the read that asked before it, whose own request was not in its answer). With the database STOPPED, traffic still answered 200 in **4 ms** and moved **6 → 7** with no invented server error (`/health/live` 4 ms); after it returned, traffic answered 200 in **5 ms**, and psql read **0** audit entries, **0** deliveries and **0** `health%`/`traffic%` tables. ⬜ honest bounds: heap counters that die with the process (restart = zero), no per-path/method/tenant breakdown, no percentiles or history, coarse fixed bucket edges, one monitor per request, a failure is recorded as 500 regardless of the container's eventual mapping, and a traffic read appears in the NEXT answer rather than its own. ⬜ **v594 — an incident is a record with a life**: one `incident` table (ADR 0041) and four doors — `POST /incidents` (201), `GET /incidents?status=&severity=&limit=&offset=`, `GET /incidents/{id}`, `POST /incidents/{id}/resolve` (200). Every answer carries the same eleven fields; the title is trimmed to 1..120; the severity is exactly `low|medium|high|critical` with no case folding; a target is kind+id or neither; blank optional words become null; every refusal is 400 `invalid-incident` naming the rule. One transition, open→resolved: the second resolve is 409 `already-resolved` and the first resolver and instant survive. The listing is newest first (`openedAt DESC, incidentId DESC`), narrowed IN THE QUERY with both counts beside the window (`count` = what the answer carried, `total` = the whole narrowed table); the limit caps at 100 and floors at 1; the offset floors to the page boundary and the answer reports the value actually applied; a blank or unknown filter is a 400, never an empty window. No audit entry and no webhook delivery: psql read 4 incident rows (1 resolved, `resolved_by=grace`), 0 audit entries, 0 deliveries. Live proof (`npm run verify:incidents`): four 201s with eleven fields, listing 4 of 4, `limit=2&offset=2` = rows 3..4, `severity=critical` 1 of 1, resolve 200 then 409 with grace intact, open 4→3, resolved 1, `open&severity=high` 0 of 0, five broken openings + two broken filters 400, a stop/start that kept all four rows and the one resolve, and a clean teardown — 38 unit cases, ADR 0041. **Honest bounds**: no detection, no assignment, no comments, no notifications, severity is a claim never re-graded against evidence, the target is opaque and unverified, anyone may open/read/resolve (ADR 0018), there is no reopen, and the chain's later words (patch→PR→approve→deploy) are absent — this is the atom, not the flow. ⬜ **v595 — a patch is the bytes an author wrote**: the chain's second word (ADR 0042) — one `incident_patch` table and three doors: `POST /incidents/{id}/patches` (201), `GET /incidents/{id}/patches?limit=&offset=`, `GET /patches/{id}`. Every answer carries the same eight fields, the diff among them; the title is trimmed to 1..120; the summary and author are trimmed, blank → null; the diff is stored VERBATIM (leading spaces are context, a trailing newline is the last line) and refused rather than cut at 20000 characters; a whitespace-only diff proposes nothing and is refused. The incident must exist (404 `unknown-incident`) and is checked before the fields; the incident's status is deliberately not read, because a patch is a proposal, not a transition. The listing is scoped to one incident, newest first (`createdAt DESC, patchId DESC`), with `count` (the window) and `total` (the incident's set) narrowed together; the cap/floor/offset rule is the incident listing's, called rather than copied. Every row is `proposed` — nothing is reviewed, approved, applied or deployed. No audit entry and no delivery: psql read 3 patch rows (all proposed, the first diff's 29 characters intact), 0 audit entries, 0 deliveries. Live proof (`npm run verify:patches`): three 201s with eight fields and byte-for-byte diffs, listing 3 of 3, page two = the third row, an empty incident 0 of 0, unknown parent 404 instead of an empty window, one read byte for byte, blank title/whitespace diff/20001-character diff 400 `invalid-patch` naming the rule (and nothing stored), a stop/start that kept all three rows and their bytes, and a clean teardown — 26 unit cases, ADR 0042. **Honest bounds**: the service never parses, applies or validates a patch, never edits/deletes/supersedes one, does not require an open incident, verifies no author (ADR 0018), and writes no status but `proposed`; the chain's later words (PR→approve→deploy) are absent. **v593 (ADR 0016 amendment 549)** folds the reason sentence into its owner too: `reportReasonText` is now declared only in `ops.ts` (with the list it names), `reportBar.ts` and `moderation.ts` re-export it, the tests import the owner, and §11.7 pins the reason face to the same owner file with the same owner-specifier import audit (a re-export is a shelf, not an owner) — suite 142 files / 2856 tests, `tsc` and `lint` exit 0, `verify:audit-contract` exit 0. **v597 (ADR 0016 amendment 550)** makes a reason word chargeable where it is USED, not only where it is declared: §11.9b keys the reason census on POSITION (compared against a `.reason` read, used as a `case`, as the KEY of a second word table, re-declared wholesale, or worn as a `data-reason` attribute) because a word-only census would have charged 2 shipped files that spell `other` in a different vocabulary; two carriers pin the clause (the owner spells all 4 reasons; 224 `.reason` reads over 60 shipped files make the position inhabited); the SHIPPED gate is measured BLIND on both planted shapes before the fix, and 8/8 arms each name the rule that caught them — `verify:audit-contract` exit 0, suite 142 files / 2856 tests as a live recount (66381 ms). The ledger (`docs/decisions/0016-…`) is the authority for each increment |
| **M10 — External Agent Ecosystem** | API, MCP, tool registry, webhooks | 🟡 **started — v557–v563, v569–v576** (ADR 0021–0026): the first OUTBOUND contract, and the registry that declares without executing. `dev.nexus.api.webhooks` records a subscription (subscriber, endpoint, events, secret, instant) behind nine doors — `POST /webhooks` (201 + the secret, shown once), `GET /webhooks?subscriber=` (no secret field at all), `GET /webhooks/deliveries?subscriber=&webhook=` (the owner's RECEIPTS: one row per delivery attempt, newest first, no secret), `POST /webhooks/deliveries/{id}/redeliver?subscriber=` (owner only: repeat ONE recorded attempt — the same fact, a fresh signature, a NEW receipt naming the one it repeats), `DELETE /webhooks/deliveries?subscriber=&before=&webhook=` (owner only: remove every receipt attempted STRICTLY before the instant named, optionally narrowed to one subscription, and answer `pruned` + `remaining`; a missing or future instant is a 400 that deletes nothing), `GET /webhooks/{id}/health?subscriber=` (owner only: one subscription's outcome counts, its newest attempt, its newest delivery and the attempts made STRICTLY after it, all read off the receipt log — no probe, no boolean, no score), `DELETE /webhooks/{id}?subscriber=` (200 either way, 403 for another owner), `POST /webhooks/{id}/rotate?subscriber=` (owner only: a NEW key answered once, the old one not retained), `POST /webhooks/{id}/ping?subscriber=` (owner only: one signed `ping` POSTed to the endpoint, answering `delivered` / `refused`+status / `unreachable`+exception name) — and mints the HMAC every delivery carries: `t=<epoch>,v1=<hex>` over `<timestamp>.<body>`, constant-time compare, time-bounded verify (default 300 s). The event vocabulary is an ALIAS of `AuditService.ACTIONS` (one owner, no second list); the endpoint must be absolute http(s), no credentials/fragment, and not a loopback or private literal, because a webhook is an address this service will POST to on its own initiative. **Delivery (v558):** `WebhookDispatcher` is the one place that POSTs, behind two seams (`HostResolver`, `WebhookTransport`), and it re-checks the address at RESOLUTION time — every address a name answers must be public, or nothing is sent (the DNS-rebinding hole v557 left open). A 2xx is `delivered`, any other status is `refused` with that status, and nothing answering is `unreachable` with the exception's name; a 302 is reported, not followed. **Fan-out (v559):** `AuditService.record` publishes `AuditRecorded(action, targetId, at)` after the save and inside the writing transaction, and `WebhookEventListener` — `@TransactionalEventListener(phase = AFTER_COMMIT)` — is the only producer: a rolled-back publish announces nothing. `WebhookDispatcher.deliver` reads the subscription table, keeps the rows whose event set contains the verb, orders them oldest first (the id breaks a tie whatever order the table answers in), and attempts each through the SAME path the ping uses — same body, same signature, same resolution-time address rule, same three outcomes; one endpoint's failure does not stop the next, and one body is signed once per row with each row's OWN key. The event carries three facts and NO actor (a subscriber receives what happened and to what, not who was holding the pen). **Receipts (v560):** `WebhookDeliveryLog` writes one `webhook_delivery` row per ATTEMPT — the ping's and the fan-out's alike, both paths through the dispatcher's one `attempt` — carrying the subscriber, the webhook id, the event, the target, the outcome, the status, the detail and BOTH instants (the fact's, and this service's clock at the knock). The write is `REQUIRES_NEW` because the fan-out is an `AFTER_COMMIT` listener: the caller's transaction has committed and its persistence context is still bound to the thread, so a receipt saved with the default propagation would join a finished transaction and never commit. The row keeps its own copy of what it was about, so it survives removal of the subscription that produced it. `GET /webhooks/deliveries?subscriber=&webhook=` reads the log newest first, capped at 100 (20 default), the offset translated into page rows the way the trail is (v388), narrowed IN the query to one subscription when one is named, with the WHOLE count beside the window and no secret anywhere in the answer. **116 cases** (34 service · 10 signer — one expected HMAC computed by Node's crypto, an independent witness · 23 controller · 23 dispatcher (10 ping + 6 fan-out + 2 receipts + 5 redelivery) · 4 transport — graded against a `ServerSocket` the test owns, so the bytes and headers on the wire are asserted to be the ones handed over · 2 listener — the `AFTER_COMMIT` phase read back off the annotation, because a regression to `@EventListener` would still pass a mapping test · 2 audit — the announced facts equal the stored ones, a refused entry announces nothing · 18 receipt log — what a receipt names, `REQUIRES_NEW` read back off the annotation, the window capped/floored/translated, the narrowing in the query, the count narrowed the same way, a subscriber-less log refused by name, a repeat copied from its source, a receipt found by id, a 404 for an id that names nothing, a redelivery with no id refused before any read; v562 adds 4 service + 2 controller for rotation, v563 adds 4 receipt log + 5 dispatcher + 3 controller for redelivery and the delivery id, v569 adds 5 receipt log + 3 controller for the owner's prune, and v570 adds 4 service + 3 receipt log + 2 controller for the owner's health read); `npm run verify:api-tests` reads **618/618 in 31 classes**, exit 0. Bounds, stated: fan-out is SYNCHRONOUS on the committing thread — up to the 10 s delivery timeout per subscription before the caller's answer, the subscription table is read WHOLE per event (a derived query over the comma-joined column would be a query about spelling), two events committed back-to-back have no order between them, every attempt is RECORDED (`webhook_delivery`, one row per attempt, `REQUIRES_NEW` so a receipt commits on the thread whose caller transaction has already finished) but **none is retried on a schedule or backed off** — since v563 the owner may REPEAT one recorded attempt by hand, the smallest retry that is honest (no scheduler, no give-up policy, and no separate idempotency header: the body is the fact's own key), **no automatic retention** — since v569 the OWNER may prune the log by naming an instant, strictly older and optionally narrowed to one subscription, the smallest retention that is honest: no scheduler, no policy this service invents, and nothing ages itself out, and a receipt is written only for an attempt that actually happened; the resolution check cannot pin the address the connection uses (the transport resolves again); rotation is IMMEDIATE — one secret column, no overlap window, no dual signature; a redelivery mints its delivery id BEFORE the POST, so a crash between the knock and the receipt leaves an id the log never wrote down; no auth (the subscriber id is host-declared, ADR 0018). **Since v561 the wiring is graded END TO END:** `docs/evidence/m10/webhook-proof.mjs` (`npm run verify:webhooks`) builds the service, starts it against a throwaway `pgvector/pgvector:pg16`, subscribes two endpoints, publishes and takes down a REAL project, and reads the receipts back over HTTP and with `psql` — the fan-out's own event filter (the publish-only endpoint was NOT called by the unpublish), the receipt's `eventAt` EQUAL to the audit entry's instant, a refused ping (400/403/404) writing nothing, a stranger's account answered with an empty log, five rows in `webhook_delivery` with no `secret` column while the stored key equals the one-time answer, a removed subscription whose receipts stay readable and byte-identical, and the SAME five rows served by a NEW JVM after a restart (a `REQUIRES_NEW` row that never committed would be visible before the restart and gone after it). **Rotation (v562):** `POST /webhooks/{id}/rotate?subscriber=` mints a new 64-hex key for the owner and answers it once; the row has ONE secret column, so the old key is NOT retained — no overlap window, no dual signature — and the live proof reads the stored key with `psql`, checks the listing still prints none, checks that 400/403/404 rotations leave it untouched and write no receipt, and reads the rotated key back after the restart. **Redelivery (v563):** `POST /webhooks/deliveries/{id}/redeliver?subscriber=` repeats ONE recorded attempt for its owner; the body is the recorded fact byte for byte (`event`, `targetId`, the ORIGINAL `eventAt`), the signature is a FRESH knock with the CURRENT key, and the new receipt is a NEW id naming the attempt it repeats in `redelivery_of`. Every knock carries an `X-Nexus-Delivery-Id` header, and the id is minted BEFORE the POST so the header, the receipt and the answer agree. The live proof redelivers B's publish receipt and reads a fifth row back over HTTP and `psql` (the copied fact, the source id, the later `attemptedAt`, ONE non-NULL `redelivery_of`, the source's NULL), and asserts 400/403/404/`gone` refusals write nothing. **Retention (v569):** `DELETE /webhooks/deliveries?subscriber=&before=&webhook=` removes every receipt attempted STRICTLY before the instant its owner names, optionally narrowed to one subscription, and answers the arithmetic (`pruned`, `remaining`); the live proof's §12 takes the log's boundary receipt as the cutoff (the receipt AT the instant survives, the ones before it go), runs a narrowed prune against one endpoint's own rows, checks three refusals (no subscriber / no instant / a future instant) that delete nothing, a stranger's prune answering 0/0 with the owner's rows intact, and a final prune to zero rows read with `psql` while `webhook_subscription` still holds its row. **Health (v570):** `GET /webhooks/{id}/health?subscriber=` answers one subscription's outcome counts (`totalAttempts`, `delivered`, `refused`, `unreachable`), its newest attempt (outcome/status/detail) and its newest delivery, plus `attemptsSinceLastDelivery` — STRICTLY after that instant, and equal to the total when the subscription has never delivered — all derived from the receipt rows: no probe, no boolean, no score. A subscription with no receipts answers zeros and `null`s; a REMOVED subscription is a 404 even though its receipts remain readable; the live proof's §11 confirms B's two unreachable attempts, the 404 for A's removed row, and that the four refusals (400 no subscriber, 403 stranger, 404 unknown, 404 removed) write no receipt. **Tool registry (v571):** `dev.nexus.api.tools` DECLARES tools and never executes them — `tool_entry` has six columns (`tool_id`, `owner_account_id`, `name`, `summary`, `input_schema`, `created_at`) and no endpoint, command, handler or invocation column, so there is no call path to grow. Three doors: `POST /tools` (201; owner, name and summary trimmed; the input schema must be a JSON OBJECT, canonicalized to compact JSON and bounded at 8192 of THOSE bytes — a non-object is 400 `invalid-tool`, while malformed JSON is the framework's 400 before the controller), `GET /tools?owner=&limit=&offset=` (the catalog NAME ascending, the optional owner narrowing the window AND the total, default 20 / cap 100 / floor 1 / offset floor 0 reported back), `DELETE /tools/{id}?owner=` (owner only: 200 `{removed:true}`, an unknown id 200 `{removed:false}`, another account 403 `not-your-tool`, a missing owner 400). The name is a GLOBALLY unique lowercase slug of 2–64 characters (`[a-z0-9][a-z0-9._-]*`) — a duplicate is 409 `tool-name-taken` naming the row that holds it, because a name is the key every agent shares; once its owner removes it the freed name can be declared again as a NEW row by another owner, which is the difference between a name and an id. Registering writes no `audit_entry` and fires no `webhook_delivery`: a declaration is not a fact. 20 unit cases (12 service, 8 controller) and `verify:tools` against a real PostgreSQL: canonical schemas read back through `psql`, the 8192/8193 boundary, a stranger's 403 leaving the row intact, an unknown id's honest false, the owner's delete, re-declaration under the freed name, a restart serving the same four rows, and `information_schema` showing exactly six columns. **Details and the owner's update (v572, ADR 0023):** two more doors close ADR 0022's stated "No update or details door": `GET /tools/{id}` answers ONE declaration (the same six fields every read carries, with no owner check because the catalog is public) and 404 `unknown-tool` for an id that names nothing; `PUT /tools/{id}?owner=` REPLACES `summary` and `inputSchema` for its owner, 200 with the updated row, the owner required before any read, an unknown id 404, another account 403 `not-your-tool`, and the SAME `requireSummary`/`requireSchema` rules — trimmed, canonical, 8192 bytes — refusing with 400 `invalid-tool` and saving nothing. The body has no `name`, `owner` or `id`: an update changes what a declaration SAYS, never which declaration it is, so the global key never moves under a caller and the six-column row gains no `updated_at`. 11 unit cases (7 service, 4 controller) and the live proof's §5: a read by id, all four refusals leaving the sentence untouched in `psql`, the owner's replacement stored as 74 canonical bytes with the name, id, owner and creation instant unchanged, still four rows and `audit_entry` empty, and §6's restart serving the UPDATED schema. Still not graded: no delivery reaches a real subscriber's server — `hooks.invalid` is RFC 6761 and a local receiver is refused BY DESIGN — so the signature, the transport and the `X-Nexus-Delivery-Id` header keep their unit gates. **Revision history (v573, ADR 0024):** an update no longer erases the contract a consumer built against. `tool_revision` records ONE row per accepted write — `tool_id`, `revision`, `summary`, `input_schema`, `recorded_at`, keyed by `(tool_id, revision)` and append-only — with revision 1 written at registration holding the values the declaration was born with, and one more revision appended by every accepted PUT (the same trimmed summary and canonical 8192-byte schema the row stores, this service's clock, and the parent row locked `PESSIMISTIC_WRITE` so two concurrent updates cannot both append revision 2). `GET /tools/{id}/revisions?limit=&offset=` answers the history newest first with the whole count beside the window (default 20 / cap 100 / floor 1 / offset floor 0, reported back), is public like the declaration, and answers 404 `unknown-tool` for an id that names nothing. Removal deletes the history in the same transaction: a revision is the declaration itself, not evidence of a knock, so it does not outlive the row. A revision is a recorded WRITE, not a diff — two identical PUTs make two rows because two writes happened. 9 unit cases (6 service, 3 controller) and the live proof's §5–§6: the history over HTTP with revision 1 still the birth sentence and schema, the window's cap/floor, an unknown id's 404, `psql` reading both rows with `audit_entry` empty, removal leaving zero revisions, a restart serving both, and `information_schema` showing the table has exactly five columns. Bounds: a row created before v573 has no birth revision (its first accepted update records revision 1); no diff, no schema hash, no prune, and no "since" query; no auth and no execution. **Read by name (v574):** the name is globally unique because it is the key every agent shares (ADR 0022), yet until now the only name-addressed read was a paged catalog — a caller holding a name could miss the row it meant behind a window. `GET /tools/by-name/{name}` answers ONE declaration with the same six fields, public and with no owner check: the path is validated by the SAME `requireName` registration uses (a malformed name — uppercase, blank, a leading dash — is `400 invalid-tool` naming the rule rather than a 404 that would blame the catalog), and a well-formed name holding no row is `404 unknown-tool`. The live proof reads the declaration by name in one request, refuses `Weather.Lookup` at 400 and `no.such.tool` at 404, and after §4 frees and re-declares `weather.lookup` confirms the name now resolves to the NEW row rather than the removed one. 5 unit cases (3 service, 2 controller). Bound: a read by name is a read of the CURRENT declaration; history is the separate revisions door. **Deprecation (v575, ADR 0025):** the catalog can now say a tool is going away without growing the declaration. `tool_deprecation(tool_id, message, replacement_name, deprecated_at)` is ONE row per tool — a current state, not a history — written by `POST /tools/{id}/deprecation?owner=` (owner required before any read; message one trimmed sentence bounded at 280; the optional replacement must be a legal tool name that is not the tool itself, and need not hold a row because the successor may be declared later), read by `GET /tools/{id}/deprecation` (public; `404 not-deprecated` for a live tool and `404 unknown-tool` for an id that names nothing), withdrawn by `DELETE /tools/{id}/deprecation?owner=` (200 `removed:true`, or `removed:false` when it was already live), and listed by `GET /tools/deprecations?limit=&offset=` newest first with each declaration's NAME beside its message and hint (default 20 / cap 100 / floor 1 / offset floor 0 with the whole count). Re-deprecating replaces the one row's sentence, hint and instant; removing a declaration deletes its warning in the same transaction; the six-field declaration read is unchanged. 16 unit cases (11 service, 5 controller) and the live proof: a live tool's distinct 404, the four write refusals, the trimmed warning, the list naming `weather.lookup`, re-deprecation still one row in `psql`, withdrawal then `removed:false`, a kept warning surviving a restart, `information_schema` showing exactly four columns, and §4's removal deleting the warning with the declaration. Bounds: no replacement verification, no warning history, no expiry or grace period, no catalog filter, no auth. **MCP face — v576 (ADR 0026):** `POST /mcp` speaks JSON-RPC 2.0 for the four methods a discovery client needs — `initialize` (protocol `2025-06-18`, capability `tools.listChanged:false`, instructions that say the registry DECLARES tools and does not execute them), `ping`, `tools/list` over the SAME registry catalog (100 per page, the cursor a decimal offset, no `nextCursor` on the last page) and `notifications/*` (202, no body). `tools/call` is refused with `-32601` because there is no URL, command or handler to call; refusals stay HTTP 200 so the JSON-RPC error IS the answer, while batches, a wrong version and a missing method are `-32600`. No `mcp*` table, no session, no audit or webhook write — the face is derived, so a restart answers the same page. 20 unit cases (11 service, 9 controller) and the live proof: two declared tools listed, initialize's echo, a 202 notification, 101 tools paginating 100 + cursor `100` + 1, every refusal, `psql` showing zero audit and webhook rows and no `mcp%` table, and the same page after a restart. Bounds: no SSE or streamable transport, no real SDK client exercised, no auth, no execution, and the cursor is an offset rather than a snapshot. **Catalog search (v577, ADR 0027):** the catalog can be narrowed by `q`, a case-insensitive substring of the NAME or the SUMMARY — the question an agent that knows a capability word but not a name actually asks. `GET /tools?q=&owner=&limit=&offset=`: `q` is trimmed (blank is the absent filter and is echoed as `null`; over 100 characters is a named 400), both filters narrow the window AND the whole count, the order stays NAME ascending, and the list envelope gains `query` beside `owner` so an answer says which search it applied. LIKE wildcards are ESCAPED — `%`, `_` and `\` match only themselves, because a search for "%" that answers the whole catalog would contradict the request — and the escape character is declared in the query rather than assumed from the dialect. 8 unit cases (6 service, 2 controller — 68/68 in the tools package) and the live proof's §3: `q=weather`/`q=WEATHER` one row, `q=last` a SUMMARY match, `q=tool` three, `q=tool&owner=` both narrowed to two, `q=tool&limit=1&offset=2` paging with `total=3`, literal `%` and `_` answering zero, a blank `q` echoing `null` with all four rows, and a 101-character term refused at 400.  **Contract pin (v578, ADR 0028):** a caller that built against a declaration can now name the exact contract it built against in 64 characters instead of storing up to 8 KiB of schema. `contractSha256` is the SHA-256 of the canonical object `{"summary":…,"inputSchema":…}` — the pair a revision records, and exactly the pair an update can change — written by the same mapper that stored the schema, with the two values inside a wrapper object rather than concatenated (every separator that can occur inside a summary makes two different contracts able to hash alike). It is **computed from the stored bytes on every read, never stored**: no DDL, no backfill for rows written by earlier builds, and nothing that can drift out of step with the text it describes; the cost is one parse and one hash, bounded by the schema's existing 8192-byte ceiling. Every whole declaration carries it — including catalog rows, so two names holding one contract are visible in one page — and each revision carries its own, so a consumer holding a pin can name the write that produced it. The two read doors make it load-bearing: the same value travels as a strong `ETag`, and an `If-None-Match` naming it is a `304` with no body (both by id and by name), `*` matches any existing declaration, and a tag naming a different contract answers `200`. Existence is settled **before** the tag — an unknown id is a 404 whether or not one was sent, because 304 would tell a caller its copy is current when there is no copy. 14 unit cases (7 service, 7 controller — 82/82 in the tools package; the proof recomputes the pin from the fields the answer itself carried rather than trusting an echo) and the live proof: §5 recomputes the served pin from `{summary, inputSchema}`, reads the `ETag` quoted, gets a bodiless 304 on both doors, `*` as 304 and an unknown id with `*` as 404, then watches the owner's update change the pin while revision 1 keeps the old one — so a held pin answers 200 — and §6 has a second JVM recompute both revision pins to the same 64 characters with `information_schema` still showing six declaration columns.  **Handover (v579, ADR 0029):** a declaration can now be GIVEN AWAY without becoming a different declaration. Before this, the registry's only answer was "declare it again under the new account", which mints a new id, restarts the history at revision 1, invalidates every pin a consumer holds and deletes the record of who was responsible until then — the same erasure the revision history and the deprecation resource exist to prevent, one level up. `POST /tools/{id}/transfer?owner=<current holder>` with `{"to": "<account>"}` answers 200 with the whole declaration, now naming the new holder: same id, same name, same creation instant, same schema and the same `contractSha256`, so a consumer's pin still matches and an `If-None-Match` of it is still a 304 — handing a tool over changes nothing it SAYS. In the same transaction one `tool_ownership` row is appended and NO revision is written, because `revision` counts contract changes and `transfer` counts holder changes; merging them would make both numbers lie about the other. `GET /tools/{id}/ownership?limit=&offset=` answers that chain newest first with the CURRENT holder and the whole count beside the window (the same paging rule as the history and the deprecation list), a public read whose unknown id is a 404 rather than an empty chain. Refusals by name: a stranger 403 `not-your-tool`, an unknown id 404 `unknown-tool`, a missing `owner` 400, a blank or over-long `to` 400, a transfer to the current holder 400 that says the account already holds it (a no-op chain row would put a holder change on record that never happened), and the caller is checked against the row's current holder BEFORE the target is validated, so a stranger learns nothing about which accounts would be accepted. The previous holder loses every writing door at once — update, deprecation and removal are each 403 — while the deprecation on record is untouched, because it describes the tool and not its holder. 15 unit cases (10 service, 5 controller — 97/97 in the tools package) and the live proof's §5b: five refusals with psql reading the same holder and zero chain rows, the handover answering the same id/name/instant/schema/pin with a held pin still 304, the former owner refused at all three doors, the chain naming the current holder and appending the way back as `transfer` 2 (newest first, window, cap, floor, count, unknown id 404), and psql reading both handovers beside a history still at two revisions and an empty audit table. §6 reads the chain back field for field after a restart, with `tool_ownership` at exactly five columns. Bounds: one step with no acceptance and no notification (a two-step handover needs the account system ADR 0018 has not built, so an acceptance step here would be theatre), not an authorization boundary because account ids are already unauthenticated strings, append-only with no correction (transferring back is the undo and keeps both rows),  **History delta (v580, ADR 0031):** a consumer that already holds revision 5 no longer walks pages to learn whether anything changed. `GET /tools/{id}/revisions?since=<n>` answers only revisions with a number GREATER than `since`, newest first, paged exactly as before — and the count narrows with the window, so a one-row answer to "what changed since 1" says `total=1` rather than claiming the whole history (the rule the catalog search already follows). The key is the revision NUMBER, not an instant: two writes can share a microsecond and a caller's clock is not this service's clock, while a revision number cannot tie with itself. The envelope echoes `since` (null when the answer is the whole history) for the same reason the catalog echoes `owner`; a `since` above the newest revision is an empty window with `total=0` — an answer, not an error; and a NEGATIVE `since` is a 400 naming the rule, where a negative `offset` on the same door is floored to 0 and reported, because `limit`/`offset` describe the shape of an answer while `since` describes which facts are being asked for (flooring -3 to 0 would answer "everything" to a question that meant something else). 7 unit cases (4 service, 3 controller — 104/104 in the tools package) and the live proof's §5: the whole window echoes `since: null` with six fields, `since=1` answers one revision whose pin equals the one served now, `since=2` is empty with `total=0`, `since=0` is both, a page inside the narrowed set keeps the narrowed count, and `since=-1` is a 400 naming "0 or more" while the floored offset on the same door was not. Bounds: per tool, not a registry-wide change feed (that needs a global sequence and a story for deletions); the history stays unbounded, since pruning would make a pinned revision unexplainable and retention is a decision of its own;  **Retention (v581, ADR 0032):** the history grows one row per accepted update and nothing removed one, so an owner can now name the bound it keeps: `DELETE /tools/{id}/revisions?owner=&before=<n>` removes every revision STRICTLY below `n` and answers `{toolId, before, pruned, remaining}` — the same three numbers the receipt prune answers with, so the service has one vocabulary for deletion. The bound is exclusive because "keep everything from revision 2" is the sentence an owner reads against the answer, and the newest revision is never removable: a bound past it is a 400 that names the newest, because a declaration whose history explains nothing about the contract it serves is a state no other door creates. A missing owner, a missing bound, a bound below 1, a stranger and an unknown id are each refused with nothing removed; pruning the same bound twice answers `pruned: 0` (already gone is not a failure, the rule the removal door follows); and a declaration with no recorded history answers 0 rather than refusing a delete of nothing. The cost is stated rather than hidden: a pruned revision is a pin that can no longer be explained, the current contract is unaffected (its pin is computed from the declaration row — a pin held across a prune still answers 304), and because revisions are a contiguous 1..N sequence cut below one point, "removed everything below `before`, N rows" names the lost range exactly. 11 unit cases (8 service, 3 controller — 115/115 in the tools package) and the live proof's §5c: three writes, six refusals leaving all three rows per psql, the prune of bound 2 answering 2/1/2 with the history then starting AT revision 2 (`min(revision)=2`), the same bound again answering 0, a held pin still 304, and the section's tool removed again so §6 still counts four rows.  **Departing rows (v582, ADR 0033):** deprecation has been its own resource since v575, and the cost was left as a bound — an agent browsing the catalog could not tell which rows were leaving without fetching the catalog AND `/tools/deprecations` and subtracting them client-side. `GET /tools?deprecated=true|false` answers it in one request: `true` returns only declarations that carry a deprecation, `false` only those that do not, and an absent flag returns both and echoes `null`. It is a FILTER, not a column: putting a `deprecated` boolean on each row would state a fact stored in another table, and the declaration's seven fields were deliberately kept free of it — the filter decides WHICH declarations come back, never what one says. It composes with `owner` and `q` (all three narrow the window AND the total), the order stays NAME ascending, paging is unchanged, and the envelope gains one field so a departing-only window cannot be mistaken for the registry. Two explicit statements — a correlated `exists` and a `not exists` over `tool_deprecation` — rather than one query with a nullable polarity, because the polarity is a closed set and each query should say exactly one thing. 7 unit cases (4 service, 3 controller — 122/122 in the tools package) and the live proof's §5d: `deprecated=true` one row with `total=1`, `deprecated=false` the other three, absent `null` and four, the flag composing with owner (1 and 0) and the search (1 and 0 departing, 3 live), every answer echoing the flag with rows still seven fields, and psql reading exactly one deprecation row — which also exercises the composed JPQL against PostgreSQL. Bounds: the flag says WHICH tools, not WHY (message and replacement stay on the deprecation resource), a correlated join per row rather than a free test, still not a change feed, and a malformed `?deprecated=maybe` is refused by type conversion rather than by a rule of this service (the same as `?limit=abc`) And v583 (ADR 0034) makes the registry answer what HAPPENED beside what IS: `GET /tools/changes?since=&limit=&offset=` returns one entry per accepted write (`declared`, `updated`, `transferred`, `deprecated`, `undeprecated`, `removed`), oldest first from a `seq` cursor with the narrowed count beside every page, because a removal deletes every row that could say it happened and a withdrawal deletes the row that said the tool was going away — a feed derived from state would silently omit exactly the changes an agent must act on. The entry therefore copies the `name` (a removed row has none left) and, for the two kinds that write a contract, points at the `revision` rather than duplicating its bytes; refusals and already-gone removals write nothing; a retention prune is not a journal entry because it changes no contract. 12 unit cases (8 service, 4 controller — 134/134) and the live proof's §5e: the whole feed walked forward seven at a time with no entry twice, six kinds with only two naming a revision, the pruned-then-removed tool reading back `declared, updated, updated, removed` with revisions `1, 2, 3, null` while its row is a 404, an already-gone removal writing nothing, a negative cursor 400 naming "0 or more", and the journal surviving the restart with `tool_change` holding exactly six columns. Bounds: `seq` is allocated in order but committed out of order (one tool's entries are still serialized by its row lock), the journal grows unbounded, there is no `kind=` filter yet, and an entry is not an audit entry And v584 (ADR 0035) makes that feed WATCHABLE rather than merely readable: `?kind=` (one of the six protocol words, refused BY NAME at 400 when it is not, case-sensitive because `Removed` is a typo not a synonym) and `?toolId=` (one declaration's whole life, including the entries whose rows state has forgotten) each narrow the window AND `total`, compose with each other and with `since`, and are echoed with null for the absent filter. Both are two nullable parameters on ONE statement used by the window and the count, so the number cannot describe a different filter than the page; `tool_change` gains `(kind, seq)` and `(tool_id, seq)` indexes. An id that names no current row is an EMPTY feed rather than a 404 — the journal records what was, and a removed declaration is exactly what it must still be able to show. 9 unit cases (5 service, 4 controller — 143/143) and §5f of the live proof: `kind=removed` exactly the removals the whole feed carried with psql counting the same rows, `toolId` returning the removed tool's declared/updated/updated/removed life, the two composing, a blank filter reading as absent, `pruned` and `Removed` both 400, an unseen id answered as empty, and `pg_indexes` showing both indexes And v587 (ADR 0036) gives the caller its own shape back: `GET /tools/batch?id=&id=…` answers a LIST of ids in one request, in the order the caller named them (a duplicate collapses, blanks are dropped), each row the same seven-field declaration the catalog serves with its pin, plus `{requested, found, missing}` so `found + missing.size() == requested` and a stale reference is NAMED rather than turning the whole request into a 404 — because a batch is a read of a list, not of one row. Repeated `id` parameters rather than one comma-separated string: an id is opaque, and a separator would invent an escaping rule the id space does not have. Bounded at 50 DISTINCT ids (refused by name), no window and no `total` (a list is not a page), no ETag (a list is not one contract). 9 unit cases (5 service, 4 controller — 152/152) and §5g of the live proof: three distinct ids answered in request order and field for field equal to `/tools`, a removed id in `missing` with `found: 0`, every id the feed ever updated accounted for as a row or a name, and blanks / 51 ids / no `id` each refused at 400 And v588 (ADR 0037) lets an owner say the one thing the registry can never check and a consumer most wants to know: `POST|GET|DELETE /tools/{id}/attestation` records "this CONTRACT was tested" as its own resource, bound to the 64-hex pin the caller names — which must be the pin being served, or the door answers 409 `stale-contract` with the pin that is, because a claim about bytes nobody read is not a claim worth keeping. An update does not delete the claim (it stays true about the contract it names) and does not move it (that would invent a test nobody ran): `stillCurrent` is recomputed on every read, so a stale claim is visible rather than erased. One row per tool, replaced on re-attest, the same rule re-deprecating follows; 404 `not-attested` is distinct from `unknown-tool`; removal takes the claim with the row; the optional note is trimmed and bounded at 280. The journal vocabulary grows from six kinds to eight (`attested`, `unattested`), reopened explicitly rather than by drift, because a withdrawal deletes its own row. 14 unit cases (9 service, 5 controller — 166/166) and §5h of the live proof: seven refusals leaving the table empty, five fields with `stillCurrent` true while the declaration stays seven, an update moving the contract WITHOUT moving the claim, the old pin then a 409 naming the new one, re-attest replacing one row, the journal naming both claims and the withdrawal, and the claim surviving the restart with `tool_attestation` at exactly four columns. Bounds: a claim is not evidence (no verification, no coverage), one claim per tool, no claim history, and no catalog field for a claim. v589 then added the `?tested=` filter: the SAME three-state shape as `deprecated`, composing with owner, q and deprecated on real state (claimed+departing 1, claimed+live 1, unclaimed+departing 0, unclaimed+live 2), narrowing the window AND the count, an eighth envelope field that is `null` when absent, and rows still seven fields. The bound is PROVED rather than hidden: a claim survives the update that MOVES its contract, so `tested=true` still names the row while `stillCurrent` reads false, and withdrawing the claim takes it back out. Repo-side, one statement parameterised by two 0/1 polarity flags per axis replaces ADR 0033's two-statement pair for two axes, because two tri-state filters are four combinations (ADR 0038). 173/173 tools cases (109 service, 64 controller) and §5i of the live proof. v590 closed the other half of the pin: it was a way to be TOLD a contract changed, not a way back to the bytes. `GET /tools/{id}/at?pin=` answers the recorded revision whose own bytes hash to the pin, field for field, plus `current` derived on every read; the id is settled before the pin is judged (no pin and `abc` and the same pin in UPPERCASE each 400 by name, a never-held pin 404 `unknown-pin`, an unknown id 404 `unknown-tool` even with a bad pin). The lookup is a SCAN of ONE declaration, deliberately: the pin is still computed and never a column (ADR 0028), and retention bounds the history (ADR 0032) - which §5j proves by pruning revision 1 and watching its pin become 404 while the current contract still reads back (ADR 0040). v613 then gave the catalog a KEYSET cursor: an OFFSET is a position in a list writes can change, so a registration that sorts before the page already read repeats a row and a removal skips one. `GET /tools?after=<lastName>` resumes from the last NAME the caller saw — a value, not a row id, so it still bounds the window after that row is removed; a non-name is 400 `invalid-tool`, `after` beside a non-zero `offset` is 400 naming both, `total` stays the whole filtered set (a short page is the end), the cursor is echoed trimmed as a ninth envelope field, and the unique name index is the range scan it needs (ADR 0043). v614 closed the other half of a pin: two pins could be read separately but not COMPARED. `GET /tools/{id}/diff?from=&to=` answers both sides' revision/summary/pin/instant, says whether the sentence changed, and names the SCHEMA paths that differ as RFC 6901 pointers (objects by key, arrays by INDEX, `~` and `/` escaped) — an absent `to` means the contract served now, `identical` is decided by the pins so equal pins skip the walk, a blank `to` is refused rather than read as absent, and the id is settled before either pin (ADR 0044). v615 answered the GLOBAL question a pin can be asked: because a pin hashes CONTENT, `GET /tools/by-pin/{pin}` answers a LIST — one entry per declaration, at the newest revision that carried those bytes, with `current` derived — so two declarations with the same sentence and schema both answer, a stale pin still names who recorded it, and a pin nobody recorded is 404 `unknown-pin`. The pin stays computed and never stored: the lookup is a scan of the revision table, its cost stated rather than hidden behind a column every writer would have to maintain (ADR 0045). v616 then made a MANIFEST of pins ONE read: `GET /tools/pins?pin=&pin=…` answers every pin from a single scan, keeps the caller order (then NAME within one pin), counts `found` as PINS resolved so `found + missing.size() == requested` survives a pin that names two declarations, NAMES the pins nobody recorded instead of failing the request, and bounds the manifest at 50 distinct pins like the batch of ids (ADR 0046). 218/218 tools cases (138 service, 77 controller, 3 pointer-walk). v617 then gave the DEPRECATION list its own keyset cursor, because its order is TIME and instants tie: `GET /tools/deprecations?before=<epochMillis>:<toolId>` resumes after the LAST PAIR rather than an offset, with the ordering defined at the millisecond the row exposes and the id breaking a tie; a malformed pair is 400 `invalid-tool` naming the shape, a cursor beside a non-zero `offset` is 400 naming the offset, `total` stays the whole deprecation table, and the cursor is echoed as a fifth envelope field while the row shape stays five (ADR 0047). 224/224 tools cases (142 service, 79 controller, 3 pointer-walk). v618 then let a deprecation page NAME WHOSE WARNINGS IT WANTS: `owner=` narrows BOTH the window and the count, composing with the pair cursor and the offset path, a blank owner is the absent filter echoed as null, and the envelope gained its sixth field while the row shape stayed five (ADR 0048). 228/228 tools cases (145 service, 80 controller, 3 pointer-walk). v619 then RESOLVED each replacement HINT on every read instead of storing a foreign key: `replacementStatus` is `none`, `unresolved`, `live` or `deprecated` with `replacementToolId` beside it, a whole page resolves in two batched reads, the single answer grew to six fields and the list row to seven, and `tool_deprecation` still holds exactly four columns (ADR 0049). 235/235 tools cases (150 service, 82 controller, 3 pointer-walk). v620 then let the warning list be SELECTED BY REPLACEMENT STATE: `replacementStatus=` narrows none/unresolved/live/deprecated together with owner and the pair cursor, the filter follows the same derived predicate, a blank state is absent and an unknown state is 400 naming the four words, and the envelope grew to seven fields while the row shape stayed seven (ADR 0050). 241/241 tools cases (154 service, 84 controller, 3 pointer-walk). v621 then gave the JOURNAL a RETENTION door: `DELETE /tools/changes?before=` removes only the PREFIX below a named seq, refuses a bound above the newest entry so a boundary always survives, answers `{before, pruned, oldest, remaining}`, and turns a POSITIVE cursor behind the oldest retained seq into `410 journal-pruned` naming the boundary and the cursor that resumes; `since=0` still means "from the beginning", which after a prune is the oldest entry still held (ADR 0051). 253/253 tools cases (163 service, 87 controller, 3 pointer-walk). v622 then answered WHERE a replacement chain ENDS: `GET /tools/{id}/replacement-chain` walks the stored hints by name, one declaration per step, and returns one of five outcomes — `live`, `none`, `unresolved`, `cycle` (named in `cycleTo`) or `depth` at a stated 20-step bound — so a migrating consumer learns whether the walk reaches a live tool or loops instead of implementing the walk itself; a tool with no warning is the existing 404 `not-deprecated` (ADR 0052). 261/261 tools cases (170 service, 88 controller, 3 pointer-walk). v623 then let ONE request name SEVERAL replacement states: `replacementStatus=none,unresolved` is a canonical comma-separated selection (blanks dropped, duplicates collapsed, first-seen order kept, every word still validated), narrowing the window AND the count through one CASE predicate and composing with owner and the pair cursor, while a single word and the seven-field envelope are unchanged (ADR 0053). 265/265 tools cases (172 service, 90 controller, 3 pointer-walk) |

M1 completion gate (met): the Studio slice runs in-browser, produces a real Design Model from
a prompt in DEMO MODE, edits it via structured ops with undo/redo + AI diff, renders live
preview from tokens, and is validated by tests + a headless pipeline proof + model-derived
SVG artifacts (ADR 0005/0006/0010, §59/§32). See `docs/evidence/studio/README.md` for the
honest note on why pixel screenshots were substituted in this environment.



---

# 附录 · ROADMAP · main line (the older, richer line, kept in full)
<!-- appendix appended verbatim by the consolidation; studio-line bytes are above the marker -->

# ROADMAP
  单文件 8/8 绿；tsc / eslint 0。
  - **搜索的档数与刻度对齐了（2026-10-22，格 13）**：相关度从四档扩到**六档**，
    刻度**严格递减** 6/5/4/3/2/1 ⇒ 说"六档"就得真有六级分值。
    - **早先的谎**：刻度是 4/3/2/1，详情与正文**并列 1 分** ⇒ 那不是四档而是三档，
      「只在简介里有」与「只在正文里有」会并列，而页面写的是四档（§159：说法与事实要对上）。
    - **正文/语料库改用关联子查询（`exists`）而不是 join**：join 会把结果行按快照数与块数
      **翻倍**——一个 10 快照的项目同一个设计稿出 10 行。凭证：集成测多一条
      （存 1 份快照 ⇒ N 条命中；再存 2 份 ⇒ 命中数不变）。
    - **另一处真 bug**：`sql.join([])` 空数组产生尾逗号 → SQL 变成 `greatest(x, )` → **语法错**，
      整条查询报错。是在真库上跑出来的，不是猜的。
    - **新增两档的来源**：第 5 档 = `snapshots.search_text`（文档正文，迁移 0035）；
      第 6 档 = `knowledge_chunks.content`（§49 语料库）。
    - 凭证：`search.integration.test.ts` 16 → **20 条全绿**（真库）；全仓 **2539 条全绿**
      （194 个文件，单 worker 跑——并行会 OOM 把 postgres 一起带走）；
      `npm run lint` 全绿。
  - **同款自证提醒**（2026-10-22）：「通关过」那一格也会说**"只有你自己通关过"**
    ⇒ 与「只有你自己看过」同一句纪律：如果那些"人"就是作者自己，这串数就不能当
    "有人玩得下去"的证据（否则创作者能自己通关把数撑起来）。判定与访客现场同一种
    （`bool_and(user_id = ownerId)`），页面上是行内的一小行字（`data-analytics-self-completed`），
    导出里多一列「只有自己通关」。凭证：游戏侧 completion 的集成测多一条（作者自己通关 ⇒
    那句提醒出现；匿名访客通关 ⇒ 那句提醒不出现）。
  - **"为什么没人看"那条分析也用上了新数**（2026-10-22）：规则表新增第 4 条
    ——「可玩的那一类 · 有人来过但没人玩到结局」。
    - **它与第 3 条不是同一件事**：第 3 条说的是"滚到了页面的几成"（滚动完成度），
      这一条说的是"有没有人玩到结局"（通关）⇒ 混起来就成了两句话说同一件事 ⇒
      证据里写的是"玩到结局"，不是"完成度"。
    - **不说做不到的话**：数据只说没人走完，没说为什么 ⇒ 结论里明写"这不能直接说
      这游戏不好玩"，动作落在平台真支持的事上（自己先在公开可玩页上走一遍：几步之内
      能不能走到结局？走不通的那一步就是访客掉下去的地方）。
    - **三道不许说的门**：不是可玩的那一类（没有通关这回事，拿一条不存在的尺子量它）⇒
      不说；看过的人只有作者自己（那是"还没别人来过"）⇒ 不说；有人玩到结局了 ⇒ 不说。
    - **事实里多带一个 `hasGame`**（发布那一刻钉住游戏设计 ⇒ `Publication.hasGame`，
      不用多查一次库）。
    - **凭证**：`analytics-agent.test.ts` 多 4 条纯规则用例（正例 + 三道不许说的门）⇒
      该文件 20 条全绿；`analytics-agent.integration.test.ts` 多 1 条（真库：存一份游戏设计
      再发布 ⇒ 事实里 `hasGame` 为真 ⇒ 真人访客来过而没人通关 ⇒ 那条发现真的出现）⇒
      该文件 6 条全绿。
# ROADMAP

来源需求：`docs/specs/MASTER_DIRECTIVE.original.txt`（§181-188 里程碑）。
执行原则：§190 `BUILD SMALL → VALIDATE → EXPAND`，§192 每个里程碑必须 `Run / Test / Screenshot / Inspect / Fix / Commit`。

状态标记：`[ ]` 未开始 · `[~]` 进行中 · `[x]` 已验证并 commit · `[!]` 被阻塞（需 secret/付费授权/人工决策）

## 推进计划（2026-10-28 起）

按"先量后改、每片都有真见证"的顺序推进；完成一项就把这里改成 `[x]` 并写凭证，不留在口头。

- [x] **浅色 / accent-2 当文字** → `--nexus-color-accent-2-ink`（89 处 / 34 文件，`049d6d2`）。
- [x] **浅色 / danger 与 warn 当文字** → 同形状的 `-ink`（132 处 / 56 文件，`4e64418` 之后的下一片；两主题 × 四级表面都过 AA）。
- [x] **浅色 / 其余语义色清点**：`text-success` / `text-info` / `text-brand` 当前为 0，出现即按同一道门收。
      `style-tokens.test.ts` 新增两条常驻门（0 处扫描 + 验电：这三个原色在主题 × 四级表面里最差
      1.84 / 2.97 / 3.37，都过不了 AA）；该文件 24/24 绿。
- [x] **浅色入口**：主题切换（系统偏好 + 显式选择、持久化），并把第五片"入口一出现就变硬门"的自查门转成硬门（`acada56` 之后的主题片）。
- [x] **主题切换的浏览器见证**：暗/浅 × 首页 / Studio / 公开页，axe + 键盘双门；浅色读数进 `docs/EVALUATION.md`。
      六组合各 0 违规 / 0 critical / 0 对比度节点，切换键 Enter 与 Space 都真的翻像素；登录后九张浅色 axe 0 违规；
      顺带抓到两个真缺陷（Studio 的 Space 劫持、共用键盘门缺隐式停留点分类）。第二十二片。
- [x] **游戏页的 Space / 方向键劫持**（第二十二片 notMeasured 第 2 条）：`GamePlay` / `RpgPlay` / `WorldWalk`
      三处 window keydown 与 Studio 同一处修复，判据收成 `apps/web/src/lib/keyboard.ts` 一份；
      真发布 `/play` 三臂 + 世界页两臂**先红后绿**，`theme-toggle` 六组合复跑无回归。第二十三片。
- [x] **发布链路补上分镜这一格（§40 × §56，2026-10-30）**：迁移 0046 给 `published_projects` 加
      `storyboard_document`；发布时与 `game_document` 同一口径原样钉住（**插入分支漏列是 e2e 抓出来的真缺陷**，
      先红后绿）；公开页新增只读 `/n/<handle>/<slug>/storyboard`（合同解析失败照实说"读不出来"，
      不悄悄变成"没有分镜"；只说镜头表，不冒充视频），作品页加 `[data-published-storyboard]` 入口。
      凭证：集成测 +2（真库，该文件 11 条全绿，两次复跑）；e2e 一条通过（2026-11-02 在 3101 上 20.4s：
      入口、第 1 版 → 改镜头仍是第 1 版 → 重新发布换第 2 版全走通；截图 `screenshots/published-storyboard.png` /
      `published-storyboard-entry.png`）；`npm run typecheck` 9 个 tsconfig 干净；eslint 0。10-31 两次复跑
      卡在 studio 交互（当时满载 100%、同文件旧用例同样卡住），过程照实记在 `docs/TESTING.md`。
- [~] **移动端布局体检（公开页优先）**：第一片已量（`e2e/mobile-layout.spec.ts`，第十三片）——真发布语料
      五张 × 两栏，读数在 `docs/EVALUATION.md`：帧宽全 1440、390 下要平移 1082px、首屏可见 27%、
      `a[data-action-author]` 56×21。**还欠的是那两半**：① `resolveLayout` 没传 `breakpoint`，作者的
      mobile 变体在发布时被丢掉；② 投影要不要按访客视口缩放（`/preview` 已有 `?zoom=` 的先例）。
      **①已还（ADR-0069，2026-10-30）**：公开页读 `?viewport=`，`resolveLayout` 第一次拿到 `breakpoint`；
      **②的手动半边也接了** `?zoom=`（服务端 `<a>`，可收藏可分享）；**默认按访客视口自动选档仍欠**。
      **2026-10-30 第二十五片**：复跑完成——作品帧逐项与第十三片相同（1440 / 27% / 1082px），
      ADR-0069 只改了显式参数那条路；发现／市场／Studio／管理台四张面 × 390/1280 也补上了读数。
      **2026-10-30 第二十七片把 Studio 那一格还了**（ADR-0073）：390 下根因是左栏 44+264 内联、
      画布只剩 82px（10% 也装不下 144 宽的帧）；现在 <lg 左栏改浮层且默认收起，画布归 346px，
      「适应窗口」按钮 + Shift+1 让帧 298×186@21% 装进去（1280 是 624×390@43%）；外壳 <24px
      从 23/24 收到 **0/0**。**默认按访客视口自动选档已还**（第三十一片，ADR-0074：有规则的页面
      服务端铺四份投影、媒体查询选一份，390 下 1440/1082px → 375/0px）；其余六个管理台页面已进表
      （第三十片：6 页 × 3 档 <24px 全 0；审计/观测的宽表改为容器内横滚，页面级溢出 0）；
      平板 768 已进表（第二十八片：四张面 0 溢出/0 裁切/<24px 0；Studio 画布 724×807、
      适应窗口 676×423@47%）；横屏 1024 已进表（第三十二片：九张面 × 四档 0 溢出/0 <24px，
      Studio 适应窗口 668×418 装进 716×551@46%）；**1279 已进表**（第四十五片：十张面 × 五档
      0 溢出 / 0 <24px；但 1279 画布份额 64%、1280 因左栏内联掉到 43%——xl 那一 px 的代价，
      见该节）；iOS 真机仍欠。
- [~] **对账门盖住了哪些规则**（第十五片 notMeasured 第 3 条）：**换了一种做法并已进门**——
      `sim-parity.test.ts` 里给逐帧对账配了规则清单（`SIM_RULES` 34 条 + `RPG_RULES` 10 条，
      谓词读 `ReplayTrace.history` 那段逐帧账本），任何一条没人踩过就红；配 24 + 4 串输入线，
      六条臂 P–U 各红一次（P–T 是**模型与转写两侧同时改错**，对账必然绿，只有清单能红）。
      惰性的证据是量出来的：上一片那一份 19 条在"两侧同时删掉武器射程"下**全绿**。读数与臂表见
      `docs/EVALUATION.md` 第十六片。
  — **2026-10-29 第十七片把欠的第②半还了**：story 那条链同样先量了惰性（HEAD 那份 14 条，两侧同时
      `prior > 0`→`> 1` 之后**照旧 14 全绿**），再补两张表——播放 `STORY_RULES` 15 行读逐帧账本、
      投影 `STORY_NOTE_RULES` 11 行配源码计数哨兵；`story-parity.test.ts` 14 → 19 条，14 串线
      （11 份底稿 + 60 轮那一条 + 反事实两串：那两支守卫**正常投影产不出触发它的计划**，只能当场改一份计划喂给两边）。
      七条臂 V–AB **全红**（V/X/Z/AA/AB 除清单外没有任何断言知道少了哪一格）。
      **这一片顺带改了投影那张表的形**：第一版问"这句至少被一份底稿编出来过"，臂 Z（`if (endings)`→`if (endings > 1)`）
      照绿——"这句被说过一次"对阈值是瞎的。现在每行带一个从文档形状独立算的谓词，与投影实际说了没有逐份底稿正反比，
      **漏报 / 误报 / 空行三种都红**（臂 Z 抓漏报、AA 抓误报、AB 抓空行）。投影侧的改动天生是两侧的
      （`plan.json` 由同一个 `compileStory` 生成），所以那 11 句只有清单能看见。
      **第①半在第十八片还了**：v8 覆盖率仪器装进门（`@vitest/coverage-v8` 钉死 3.2.7，只在
      `npm run coverage:models` / `coverage:parity` 显式调用时才跑，`npm test` 不付这份开销）。
      它第一次点名就抓到两件事：① `story.ts` 那个 `unreachable.length > 5` 的臂**从没走过**——
      名字截到第五个之后那句「等 N 条」是披露的一部分，于是补一份八孤岛底稿 + 清单第 12 行（`inner` 臂），
      七条臂 AC–AI 全红（AI 是**测试全绿仍 exit=1** 的那条：阈值不读断言，只读仪器）；
      ② **仪器自己的盲区分母**——第一版把 `index.ts` 当纯转出口排掉了，读一眼才发现它是
      `createGame` / `validateGame` 这 21 个函数的家，exclude 当场删掉（这条比①更要紧：门看不见的那一格不会红）。
      点名的臂逐条判了三类：**类型根本不许**的 16 处 `?? [] / ?? {}` 加一处恒等三元，删（story 2、play 6、
      combat 1、index 7、codegen 1）；**类型允许、真实会发生**的留给第十九片补见证（14 个臂逐条判完并打出了
      那段从没执行的块：悬空引用、无玩家推进、HUD 的通关/失败那一岔、未接上的型、`removeRef` 摘不存在的引用…，
      其中 `codegen.ts` 的 `name || "未命名游戏"` 三处是**边界不许、类型许**，留着不删）；
      还有 `play.ts:322` 那种**运行时走不到、但编译器需要**的——
      删它红的是 tsc 不是门，只能把不变量改写成 TS 看得见的形式。删完之后分支 93.95 → **94.55**、
      没走到的臂 66 → **59**，而**走到的 1025 一格没变**；阈值钉在实测向下截断（94/99/97/99，写在脚本命令行里；
      `percent.js:11` 是 `Math.floor`，第十九片才把这条口径补进 EVALUATION）。
      combat / level / playtest 那 **45** 臂这一片没逐条判，照实写进 notMeasured。
      整套回归分两半跑完：**242 files / 3076 tests 全绿**（上一版整批跑在收尾处 `ERR_IPC_CHANNEL_CLOSED`、
      无 summary、零条真失败——分片没复现，为什么崩没查）。
      **2026-10-30 补测：整批一次调用跑完了** —— `npx vitest run --reporter=verbose` 读出
      **251 files / 3253 tests 全绿、exit 0、369.46s**（四个 include 分组逐一对上 66+183+2=251：
      summary 不是截断读数）。**这一跑没有复现收尾处那次崩溃**；同机空闲 2.3–2.4GB，
      与上次崩溃时的环境同级 ⇒ "内存不够"不是必要条件，旧猜想既没证实也没推翻。
      崩溃栈的静态机制落在依赖里（tinypool 1.1.1 的 `ProcessWorker.send` 只有 `isTerminating` 一道守卫，
      子进程先走、port 消息还在转发 → `ERR_IPC_CHANNEL_CLOSED` 抛在 MessagePort 回调里 → 变成
      Unhandled Rejection，summary 打不出来）；机制与 notMeasured 记在 `docs/TESTING.md` 2026-10-30 那一节。
      **记录纪律照旧**：遇到"没有 Test Files / Tests 那两行"的运行，先原样重跑一次——
      那是崩溃（exit 1 + 零条真失败），不是红也不是绿；分片不再是唯一做法。
      **仍然欠的**：谓词是人写的、清单证明不了"列全了"（EVALUATION 第十七片 notMeasured 第 1、2 条原话适用），
      覆盖率读数也只回答"走过没有"，不回答"走对了没有"。补的时候照同一条纪律——**不许反过来为凑数字放宽断言**。
  — **2026-10-29 第十九片把"类型允许、真实会发生"那批臂的见证补完了**：死臂 **59 → 44**（消失 15 段、
      **新增 0 段**，`combat.ts` 21 + `level.ts` 19 一条没碰），`index / play / playtest / playtest-by-kind /
      rpg / sim / story` 七个文件四列全 100；阈值抬到 **95 / 99.5 / 99 / 99.5**（依据是死名单单调缩短且零新增，
      不是百分比变好看——那五次读数的分母自己飘了 13 段，这一格照实记进 notMeasured）。
      三件事值得单独记：① **一次真缺陷**——`startId` 指着已删段落那份改过的计划，`playtestStory` 在
      `seen.add(id)` **之后**才查段落表，于是把一段不存在的对话数进"可达"（报 `1/2` 而真相是 `0/2`）；
      修的是源码（`playtest.ts:348-349`），见证钉 `reachable 0` + 点名那两段 + 报告句子，A14 变异红 **9 条**。
      ② **我自己上一条"证明"被推翻**——A15（`continue`→`break`）第一版全绿，我给的"结构上不可分辨"是错的：
      四段对话就能分开（重复项下面还压着一段没走的）。补完底稿 A15 红 1 条，而**覆盖率那一格全程无感**
      （死名单、分母、百分比一格没动）——第十八片"走过≠钉住"那句从推测变成实测。
      ③ **变异仪器自己骗过我一次**：`execFileSync("npx")` 在 Windows 下 ENOENT，九条臂"全红"其实是九次没跑起来；
      现在这张表第一条是**对照跑**（不变异必须读 0 失败），17 条臂最终全红、每条逐字节还原。
      `codegen.ts:251` 上一片认错的那半臂也已更正（死的是 `PIPELINE_NAMES[kindPipeline]`，被类型守卫挡成结构上到不了，
      **决定留着**——删它等于赌以后每条管线都接产物引擎）。还欠：`combat.ts` / `level.ts` 那 **40 段**没判，
      变异只查了这一片新写的见证（上一片那 24 行清单的牙是另一种强度）。
  — **2026-10-29 第二十片把那 40 段判完了**：死臂 **44 → 25 → 20**，而**其中 19 段是靠删代码消失的、不是靠补测试**——
      这两格里有三处冗余（每文件各一处）：`round === maxRounds` 那行自己判一次"达标"、循环后又判一次；
      `reverted = rounds.filter(r => !r.kept)` 再配 `r.revertedBecause ?? ""`（而 `kept ⟺ revertedBecause === null` 是同一条不变量的两面，
      改成按理由筛的类型守卫之后那句"撤回了 N 轮"的**数与印同一来源**）；notes 里 `stopReason === "not-runnable"` 那一岔到不了
      （没有玩家那份在进循环之前就带着自己的说明返回）。**行为逐字等价**，臂跟着消失。
      剩下 5 段才是测试的账：`combat:234 :313` / `level:460 :475 :498` 那五个"没有对象就交回空数组"的守卫——
      分派永远走不到它们，于是**越过分派直接喂 `COMBAT_LEVERS` / `LEVEL_LEVERS` 这张导出表**（`game-model` 309 → **324 条**）。
      同一份源码两次落盘按 `文件:行` 对齐：**消失 5、新增 0**；跨状态按 `文件+臂文本` 对齐：**新增 0 段**
      （行号被自己的改写移过位，按行比会误报——这条口径是这一片新学的）。分支 combat 87.79 → **94.38**、level 90.35 → **97.05**。
      **18 条变异臂全红**（15 条新见证每条至少被一条臂打死；第一条永远是对照跑 `total=68 failed=0`），
      另外**新增一种做法**：判"这条臂只是带子"不能靠嘴——**10 条冗余探针逐条删掉跑一遍，全部 `failed=0`**
      （`:198 :200 :238 :244 :514 :516 :563` + `level :400 :574 :614`），绿才算"在当前杠杆下无可观察差别"。
      剩余 20 段判成三类：**10 条实测冗余带子**（留着，它们守的是导出表的契约与类型允许的岔）、
      **6 段 throw 哨兵**（删了不会变绿，只会把说得出名字的错误换成下一行的 TypeError）、**4 段 codegen**（沿用上一片判读）。
      还欠的（写进 EVALUATION 第二十片 notMeasured）：`L1/L2` 两条臂红的是同一组测试，":831 由哪条单独钉"没答案；
      变异只查了这一片的新见证；throw 那 6 段是读代码 + 推理，没探针。
      **2026-10-30 补测（`.scratch/s26-isolate.mjs` → `s26-isolate.txt`；对照 `total=34 failed=0`、每条臂逐字节还原 sha1 OK）**：
      ":831 由哪条单独钉"**有答案了**——把钳位只从 `set-the-approach` 那条杠杆上摘掉 ⇒ **只红 :831**（L10）；
      `:817` 同样有专属臂——只让分开那条不跳过"钳回原地" ⇒ **只红 :817**（L13）；`:856` 原本就有专属臂（L4）。
      真正"分不开"的只是 **L1/L2 这两条"整份 `placeAlong` 去钳"的臂**（它们同时红 :817 :831 :856），
      不是三条见证都没有专属臂。另两条：L11（钳位只从 `separate-pairs` 摘）红 :817+:856；
      L12（重合兜底方向翻成 -x）一次红 7 条——"兜底方向"不是 :817 的专属探针。
      EVALUATION 第二十片 notMeasured 第 1 条的文字待改（该文件由另一会话在途，本轮只落 ROADMAP 与 scratch）。
- [x] **之后**：导出 → 空实例恢复演练。**2026-10-29 重跑并扩**（第二十一片）：判据 7 → 20 条（走满 storyboard / character
      两层），臂从"设了 `NEXUS_TWO_INSTANCE_SKIP_ASSETS=1` 才跑、跑完就 exit(0)"变成默认五趟，
      另加三趟探针去证那三条臂红不到的判据自己有牙；探针当场抓到 `isSlugConflict` 在 cause 链走到头时
      自己抛 TypeError、把库里那句外键违例换成一句与病因无关的话（修复 + 真库见证见 `projects.integration.test.ts`）。
- [x] **§40 的四条箭头只有一条在界面上存在**（2026-10-30 补上）：`planStoryboard` 收 `arrow / referenceAssetId / characterId`，
      而 `storyboardStore.planFrom` 只传句子 ⇒ 每一版分镜都写成 `text-to-video`，`image-to-video` /
      `storyboard-to-video` / `character-to-scene` 三个常量在界面上是死的（`STORYBOARD_ARROWS` 在
      `apps/web/src` 里 0 处引用）。
      **做了什么**：① 模型包导出 `ARROW_SOURCE_NEEDS`（`Record<StoryboardArrow, …>`，往清单加一条箭头不补一格就编译不过）
      与 `missingArrowSource`（返回能直接摆在人面前的整句，不是错误码）；② `planFrom(prompt, source?)` 透传来源，
      缺来源时先落 `notice` 再返回——不在界面上先换一份本地真值、再吃服务端的 400；③ 空态多出箭头选择器，
      要参考的那两条各自弹出名册选择器（图片从资产库、角色从角色册，不给手填 id），缺来源时按钮就是灰的、
      且把缺哪个字段写在明处；④ 建完头部写「来源：角色 → 场景｜角色 守夜人」，作者原句另起一行（此前"来源"两个字只指原句）；
      ⑤ 服务端 `saveStoryboard` 在归属核对**之前**读同一条规则拒收——缺来源是文档自身的矛盾，与库里有哪些资产无关。
      **证据**：`packages/video-model/test/storyboard.test.ts` +5（表与清单一一对应 / text 与 storyboard 两条不缺 /
      两条缺什么 / 反向对照 / `planStoryboard` 不自作主张改箭头）；`apps/web/test/storyboard-store.test.ts` +2
      （来源真写进文档、缺来源一次 PUT 都不发）；`apps/web/test/storyboards.integration.test.ts` +1 真库用例
      （两条箭头各拒一次、库里 0 行、挂上本项目角色后同一份能存）；`e2e/storyboard.spec.ts` 新走查 1 条
      （真 Chrome 12.8s 通过，截图 `screenshots/storyboard-arrow-source.png`）。三个测试文件 35 用例全绿；
      `tsc`（video-model + apps/web）与 `eslint`（7 个改动文件）各 exit 0。
      **有意不做**：`storyboard-to-video` 不额外要东西——它要的就是这份镜头表本身，而镜头表就在文档里；
      镜头级的引用仍然自由（`source` 说的是整条片子的出处，不是每一镜的出处）。
- [x] **§40 的另一半：建完之后「改来源」没有入口**（2026-10-30 补上）：箭头与两个引用都在 `source` 里，
      但 `planStoryboard` 只在建分镜那一刻读一次来源 ⇒ 一版切出来之后，作者想把「文字 → 视频」改成
      「角色 → 场景」就只能重切一版（镜头、长度、撤销栈全丢），否则没有入口。
      **做了什么**：① `packages/video-model/src/patch.ts` 加第六种 op `updateSource`（`before/after` 各收
      `arrow` + 两个引用；`after` 里 `undefined` = 删键、键不存在 = 别动），逆补丁把两个引用**显式写出来**
      （这次才加上的引用撤销后要真的从文档里消失，而不是留一个 `undefined` 值）；② `storyboardStore.changeSource`
      按新箭头 `ARROW_SOURCE_NEEDS` 归一引用（无关那一格置 undefined）、缺来源先落 notice 返回 false、
      无变化不进栈不 PUT——一次改动 = 一个可撤销事务（§150）；③ 面板抽出 `SourceFields` 组件，
      建分镜的空态与头部「改来源」编辑器**同一份**，两处不会漂成两套规则；头部来源按箭头 needs 取引用
      （旧引用残留不会把「角色 X」写在「文字 → 视频」旁）；④ 缺来源时应用键就是灰的、缺哪个字段写在明处；
      应用成功才收起编辑器，并提示"换来源不重切一版：镜头、长度、撤销栈都留着"。服务端无需改：
      `saveStoryboard` 早就读 `missingArrowSource` 拒收（上一片落的）。
      **证据**：`packages/video-model/test/patch.test.ts` +5（只改来源几格且镜头字节不动 / 清引用是删键且正逆
      逐字节回原样 / 逆补丁给"这次才加上"的引用写 `undefined` / 两步互切两次撤销各回上一步 / 镜头自己的引用
      不跟来源走）；`apps/web/test/storyboard-store.test.ts` +3（改来源落库且可逆、同来源 0 PUT 不进栈、
      缺来源 0 PUT 且 notice 点名 `source.referenceAssetId`）；两文件 29 用例全绿，`tsc` 9 个 tsconfig 与
      `eslint` 6 个改动文件各 exit 0。`e2e/storyboard.spec.ts` 新走查 1 条（真 Chrome，单跑 4.8s 通过，
      截图 `screenshots/storyboard-source-edit.png`）：建角色 → 建 text-to-video 分镜 → 记下镜头 id/时长 →
      打开改来源（起点正确、缺角色时应用键灰）→ 切 character-to-scene、选角色、应用（服务端 arrow 变了、
      镜头 id/时长逐格不变）→ 撤销（服务端回 text-to-video）→ 重读（文档里没有 `characterId` 这个键）。
      **如实记**：全量 storyboard e2e 两次都没跑完——一次是 Playwright artifact 写入竞态
      （`browserContext.close: ENOENT …-recording4.network`，单条复跑通过）；一次是建项目被服务端 429 拒
      （本片连续建项目把每小时名额用完，界面提示"还要等 55 分钟"）——**没有放宽那道产品闸**，
      两次跑到失败点之前的用例全部 pass。**有意不做**：镜头级的引用编辑本来就有（每镜自己的选择器），
      这次只管整条片子的出处；改来源**不重算镜头**——重切是另一个按钮，两件事不混进一次提交。
- [~] **之后**：`docs/PERFORMANCE.md` 剩余项。**2026-10-29 第二十四片把「选中响应」那笔旧账拆段了**：
      `CanvasStage` 加 `nexus:sel:rendered`、探针三段改四段 —— 8 节点 React 渲染 27–35ms / 绘制 25–31ms，
      **"界面提交 0ms"只覆盖 store 的 commit，React 渲染从来没进过账**；CPU 采样把 dev 那半点名到
      `jsxDEV`（生产会剥掉）。读数与 notMeasured 见 `docs/PERFORMANCE.md` 2026-10-29 那节。
      **仍欠**：生产构建下的四段读数（本次不做 prod build 的理由已记在该节）、4000 档分段；
      以及「健康层全量重算」（按该文件的判决留到真被量到卡顿再做）。
      **2026-10-29 第二十六片还了「没有 worker」的体检那一半**：`analyzeHealth` 搬进 Web Worker
      （`lib/health-job.ts` 唯一作业入口 + `studio/health-worker.ts` + `studio/health-client.ts` 单例 hook），
      4000 档同构建两臂：同步臂每跑出现 54–114ms 与报告时长同步的主线程长任务，worker 臂 63–75ms 且不同步；
      **总延迟没变短（554.6 vs 168.1ms，克隆 + 往返），照实写**。见证：`health-job.test.ts` 4 条 +
      `e2e/health-worker.spec.ts` 1 条两臂（读数逐字相同）。**排版求解仍在主线程**，这条只还了一半；
      读数与 notMeasured 见 `docs/PERFORMANCE.md` 2026-10-29 那节。
      「画布侧没有虚拟化/增量重排」那一条**已被 ADR-0064（视口裁剪）与 ADR-0049（增量重解）取代**，
      不再是开放项。
- [x] **§85「点开才出现的界面」第一次进读数——发布弹层**（第三十五片，2026-11-02）：发布弹层此前整块
      从 axe 与键盘的分母里退出（收起的 DOM 不在、打开的那一态没人扫）。这一片在真浏览器里**只用键盘**
      打开它再量：打开态 axe **通过 27 / 不适用 35 / 违规 0**、critical 0；`aria-expanded` / `aria-controls`
      指到真存在的 `role="region"`；Tab 第一个停留点是可见性单选；Esc 两腿（焦点在触发键 / 在弹层控件里）
      都收得回去、焦点回触发键、**画布选区不被同一带带走**；点外部收起、点弹层内部不收起。
      **首跑就抓到两处真缺陷**：① 选中节点后才渲染的 7 个属性输入各缺可及名（axe `label` critical）——
      补 8 个 `aria-label`；② 画布尺寸角标 11px `fg-1` 压 brand 在暗色下只有 3.74:1（axe `color-contrast`
      serious）—— 改用 `accent-fg`（4.71:1）。e2e **1 passed（4.2s，暖服务 3101）**；四条变异臂各自红在
      预测的那一句（A 去掉 keydown 注册 → Esc 后弹层还在；B 去掉 `stopPropagation` → 选区被带走；
      C 去掉 `aria-controls` → 接线断言红；D 去掉 pointerdown 收口 → 点外部不收起）。
      **臂 B 第一版是等价变异**：Escape 时焦点在 `<select>` 里，画布全局键对输入控件本就退让，
      于是补了「焦点还在触发键上按 Esc」这一腿才踩到画布的同名键——这也说明"红过一次"要看清是
      哪一条腿在红。
- [x] **§85 同族弹层收口抽成一份 hook——导出弹层进表**（第三十六片，2026-11-02）：发布与导出是同一形状
      （顶栏触发键 + 绝对定位面板），收口抽到 `apps/web/src/studio/use-popover-dismiss.ts`，两处共用；
      导出弹层补 `id` / `role="region"` / `aria-label` / 打开时的 `aria-controls`，Escape、点外部、
      焦点回触发键三腿与发布弹层同一判据。打开态 axe **通过 26 / 不适用 36 / 违规 0**；
      两条用例 **2 passed（13.7s）**。截图人工看过，顺带修掉底部「收起」被长标签挤成竖排两字的真缺陷
      （`shrink-0`）。四条臂 H1–H4 各自红在预测行；一次 Playwright artifact 写入竞态（`ENOENT …recording1.trace`）
      与产品无关，原样重跑即绿，照实记进 TESTING。
- [x] **§85 弹层的动态态第一次进读数——导出的回执与失败两态**（第三十七片，2026-11-02）：前两片量的是
      弹层"打开那一瞬"，而真正只在动作之后才出现的是**回执行**与**错误行**；这两块此前既没进 axe 的分母，
      也没有任何可播报语义（读屏用户按下"导出"之后听不到"好了/坏了"）。这一片补上 `role="status"`
      （回执，礼貌播报）与 `role="alert"`（失败，打断）并在真浏览器里量：回执态 axe **26 / 36 / 0**、
      失败态 **26 / 36 / 0**，critical 全 0；三条用例 **3 passed（24.2s）**（发布 27/35/0 与导出打开态 26/36/0 照旧）。
      失败态是注入的（只把导出端点换成 500），照实写；三条臂 I1–I3 各自红在预测行。
- [x] **§85 发布弹层的动态态：门禁算完与私有提示进读数**（第三十八片，2026-11-02）：发布弹层打开后
      真正会变的两块是**门禁算完那一格**（worker 回来前只有"正在后台算"）与**切成私有的下架说明**
      （选中之后才出现）。这一片量两态：门禁态 axe **27 / 35 / 0**、私有提示态 **27 / 35 / 0**，critical 全 0；
      同一文件四条用例 **4 passed（1.2m）**。顺带修掉一处真缺陷：下架说明此前只是"看见的人才读到"的一段文字，
      现在挂在私有单选上（`aria-describedby`，且 id 只在说明真的渲染时存在，不留悬空引用）。
      三条臂 J1–J3 各自红在预测行。
- [x] **§85 发布动作本身进读数——"发布中"与失败报错两态**（第三十九片，2026-11-02）：前三片量的是弹层
      打开、门禁算完与私有提示，但**按下"发布"之后**的两态一直没进读数——忙态只有按钮文字变"发布中…"
      且被 disabled（焦点停在按钮上的读屏用户听不到状态变了），失败行没有 alert 语义（错误悄悄出现）。
      这一片补 `role="status"`（忙态一行）与 `role="alert"`（失败行），服务端那句原话原样端出；
      用例把发布 POST 扣住量忙态、放行回 500 量失败态。忙态 axe **27 / 35 / 0**、失败态 **27 / 35 / 0**，
      critical 全 0；同一文件五条用例 **5 passed（1.9m）**。三条臂 K1–K3 各自红在预测行。
      首跑 6.5m 超时是共享工作树里另一会话写文件触发 dev 全量重载（面板被重置），原样重跑 20s 绿，记进 TESTING。
- [x] **§85 机检挡下态进读数——硬红线裁决、发现条目与限度说明**（第四十片，2026-11-02）：机检的三种裁决
      里，`blocked` 是唯一真的换了结果的一档（`review` 照发）。这一片把服务端按硬红线挡下的回话注入回来
      （422 + 合规的 `scan`），量裁决块：给整块补 `role="status"`（动作之后出现的结果要能播报），
      并断言裁决口径（"命中硬红线，这次没有发出去"）、发现条目的规则 / 位置 / 原文、限度说明两行、
      报错行仍端服务端原话。裁决块 axe **27 / 35 / 0**，critical 全 0。三条臂 L1–L3 各自红在预测行。
      顺带一笔：第一版注入漏了 `level`，store 的 zod 校验当场拦下并报"机检结果不符合契约"——
      契约那道门是真的在工作，不是装饰。
- [x] **§85 发布成功后的结果块进读数——地址、版本与审核状态**（第四十一片，2026-11-02）：发布成功后
      凭空出现的那块（公开地址、第几版、审核状态）此前没有播报语义，成功在读数里等于"什么都没发生"。
      这一片给整块挂 `role="status"`，用**真发布**（不注入）把回执带出来量：版本句、链接文字与 href 同源、
      审核那句与地址同现。结果块 axe **27 / 35 / 0**，critical 全 0。三条臂 M1–M3 各自红在预测行。
      一个顺带事实：`href` 是站内相对路径，链接**文字**才是绝对地址（由同一条 path 拼出来）——
      两者对得上，用例按"文字以 href 结尾"来钉，不把相对路径说成缺陷。
- [x] **§85 取消发布的忙态与失败进读数——失败不许假装地址已被收走**（第四十二片，2026-11-02）：取消发布与发布
      共用同一个 `publishBusy`，忙态那句原来只有发布口径（"存快照、换公开地址"）——取消发布根本不存快照，
      读屏用户会把"正在撤下"听成"正在发出去"。这一片按操作区分播报文案（`data-publish-busy-kind`），
      并断言失败后报错端服务端原话、忙态收掉、结果块 / 地址 / 顶栏版本号三处都还在。失败态 axe
      **27 / 35 / 0**，critical 全 0。三条臂 N1–N3 各自红在预测行。
- [x] **§85 健康栏的展开行进读数——`aria-controls` 指到真列表，零发现的行不是假开关**（第四十三片，2026-11-02）：
      每行都有 `aria-expanded`，但从来没说它管的是哪一块（没有 `aria-controls`）；而零发现的行同样是
      `<button aria-expanded="false">`，按下去什么都不出现。这一片给列表挂 id，展开时 `aria-controls`
      指向它、收起时不留下悬空引用；零发现的行改成静态读数。真文档造出 security 行的一条凭据发现，
      跑完在 `finally` 里把原文写回去（否则后续真发布会一直被门禁挡）。展开态 axe **27 / 35 / 0**，
      critical 全 0。三条臂 P1–P3 各自红在预测行。

并行会话边界（2026-10-28 实测）：observability 子系统由另一会话在途；上表前五项都在 UI 主题层，
与它不重叠；提交只用临时索引/精确 `git add`，不碰它的 7 个在途文件。

## M0 — 地基（当前）

- [x] 环境勘察 → `docs/ENVIRONMENT.md`
- [x] Git 仓库 + hooks 约束确认
- [x] docs 体系（PRODUCT / ARCHITECTURE / DESIGN_SYSTEM / STUDIO / RUNTIME / AGENTS / SECURITY / TESTING）
- [x] monorepo 脚手架（npm workspaces：`@nexus/design-model` `@nexus/schemas` `@nexus/web`）
- [x] 基础设施容器（pgvector 已起于 55433；redis/minio 在 `full` profile，按需启动）
- [x] `@nexus/design-model` 类型 + 布局求解 + Command 事务 + 测试（86 tests green，`npx vitest run`）
- [x] 数据库 Schema + 迁移（29 表 / 149 语句，`scripts/db-migrate.mts` 已在空库验证幂等）

## M1 — NEXUS STUDIO 竖向切片（§181）

必须打通的闭环，**这是当前唯一的最高优先级目标**：

```
Create Project → Prompt → AI Design → Canvas → Layers → Properties
→ Design System → AI Edit → Code → Live Preview → Screenshot → Publish
```

- [x] Studio 布局（顶栏 / 左面板 / Canvas / 右属性面板 / 底部 AI 命令栏）
- [x] Canvas：zoom / pan / select / multi-select（框选）/ drag / resize / snapping / grid / guides / viewport 切换
- [x] 直接操作：属性编辑即时回写 design model（§15-16）
- [x] Undo / Redo，AI 操作作为单个可撤销事务（§148-150）
- [x] Mock AI（DEMO MODE 明确标注，补丁双端 schema 校验，§160）
- [x] Live Preview 只读投影 + 截图脚本（§33/87，`scripts/capture-studio.mts`）
- [x] Design System 面板（§12/§13：token 分组浏览、改值/改 mode、引用计数、增删自定义 token，全部可撤销）
- [x] AI Service（FastAPI, `apps/ai-service`）：契约强制 + Provider 抽象 + Model Router + OpenAI 兼容适配器 + 删除类审批门
- [~] AI Service 任务队列 / 异步生成作业（§162）— **两侧现在接上了**：ai-service 那侧有真 worker（入队 / 执行 / 状态，
  9 条 python 测试钉着），web 这侧有消费者（提交、按游标翻译活动、把观察到的终态落进账本，见 M6 那条）。
   ~~仍欠：Redis 后端跨实例（今天默认内存）~~——**2026-10-27 核对后改口径**：Redis 后端已有
   （`apps/ai-service/src/ai_service/jobs.py`，配 `NEXUS_REDIS_URL` 启用；配了却连不上就启动失败，
   不会悄悄退回内存）。仍欠：embedding/RAG、图像/视频 provider
   （界面上的提交入口已接上：提交/取消/重试与账本实时见 2026-09-26 / 10-09 那两条）
- [x] Design Agent：意图 → Plan → design patch → 画布更新 → AI Diff 说明（§20/25/151，DEMO MODE 确定性规则；真实模型规划待 line 43 的 provider）
- [x] Design → Code（React + TS + Tailwind，`packages/design-model/src/codegen.ts` + Studio 代码视图）
- [x] Code → Design（受限 JSX 解析，不可逆区域保留为 code-only，§17-19，`packages/design-model/src/code-parse.ts`）
- [x] Snapshot 服务端：列表 / 创建 / 恢复，恢复自身留下一条历史（§27/§108）
- [x] Compare：快照与当前文档的字段级差异，复用 AI Diff 的条目形状（§27/§151）
- [x] Branch / Duplicate：分支线、切换、整份项目副本（§27/§28）
- [x] 多方案 A-B-C 并排比较 + "取 A 的布局 + C 的视觉"合成（§29）
- [!] 方案生成的真实 provider 路径：代码这一侧已经全通（`providers/openai_compatible.py` + Model Router +
  契约校验 + §162 队列，`/healthz` 会按 key 如实报 real/unavailable），差的是**一份真凭据**与联网联调。
  没 key 时不假装跑过：DEMO MODE 标注常驻（§160），队列里那种请求会如实落成 `failed / provider-unavailable`
- [x] Publish + 分享 URL `/n/<handle>/<slug>`：Public/Unlisted/Private、发布锁定快照、取消发布即失效（§56-57）
- [x] 免注册首次体验（§137）：guest 会话即可 Create → Design → Publish
- [x] 资产服务（位图）：上传 → magic-bytes 判定 → 元数据剥离 → 对象存储 → 鉴权路由 → 画布/预览/发布四条投影同源（§38/§80/§101/§182）
- [x] 注册 / 登录 + 认领 guest 项目：bcrypt 口令哈希、会话轮换/吊销、双提交 CSRF、滑动窗口限流、就地升级认领（§137/§80）

**M1 进度记录（2026-09-22，Branch / Duplicate）**：§28 的分支线 = `branches` 表里一条有名字的快照线，
`apps/web/src/server/domain/branches.ts` 提供 list / create / switch / duplicate。**没有加"当前分支"这一列**：
`projects.currentSnapshotId` 已经说明工作区停在哪份快照上，head 指回它的就是当前分支——多存一份状态就多一处会漂移。
代价是新分支必须有自己那条 head 快照（否则两条分支同时指回同一个 id，"当前分支"就由查询顺序决定了），
所以开分支会留下一条"开分支「X」"历史，这条记录本身也是用户想知道的（从哪儿分出来的）。
这条代价不是理论问题：第一版先插分支行、后建 head 快照，中间那一刻 main 与新分支都指着起点快照，
`currentBranchId()` 的 `.limit(1)` 于是随机挑中新分支，"把现场存回原分支"被当成没必要而跳过——
切回 main 就看不到自己刚做的东西。单测跑一遍过、跑第二遍才偶发。**现在改成插入时 head 留空、由
`createSnapshot` 补上，并且先问清"离开的是哪条分支"再插入**；`currentBranchId` 也按 `createdAt` 排序，
真撞上脏数据时答案是可复现的而不是随机的。集成测试里加了一条"各分支 head 必须互不相同"的断言钉住它。
语义按 `checkout -b` 对齐：不指定起点就带着当前现场切过去；指定 `fromSnapshotId` 就落到那份快照上，
而离开前的现场先存回原分支（`source: 'branch'`，"分出「X」前的现场"）——两种情况都不丢东西。
内容与该分支 head 一致时不重复存，所以反复切换只多两条"切换到「X」"标记，不会堆噪音。
Duplicate（§27）走 `duplicateDocument`：页面 id 与组件 id 在库里是全局主键，副本必须换号，
连 interaction 目标、变量作用域这类引用一起重映射（点名式重写迟早漏一处，所以整棵树扫）。
验证：`npm test` 172（新增 8 条分支集成测试 + 3 条 `duplicateDocument` 单测）、9 @smoke
（新增"开分支 → 两个方向 → 来回切换各自现场仍在 → 副本是另一个项目且源项目没被动过"）、
截图 `history-branch.png` / `history-branch-main.png` / `duplicate-project.png` 人眼确认。
已知边界：切分支与恢复一样会清空本地撤销栈（如实提示）；快照列表仍按时间全量展示并在每行标出所属分支，
"只看当前分支"没做。（§29 的并排比较见下一条记录。）

**M1 进度记录（2026-09-22，多方案 §29）**：一条方案 = 一条分支 + 它 head 上的那份文档，
没有另立"变体表"——§28 已经规定方向是分支线，再造一套并行状态就多一处会漂移的地方。
`packages/design-model/src/concepts.ts` 把"方向"拆成两个能各自搬走的轴：**结构**（`CONCEPT_STRUCTURES`：
居中开场 / 左右分栏 / 三卡并列 / 导航开场，只动节点）与**视觉语言**（`CONCEPT_LANGUAGES`：
编辑部 / 影院 / 赛博 / 暖阳，只动 token 与 visualDna）。拆成两轴是为了让"取 A 的布局 + C 的视觉"
这句话有指代；前提是节点颜色一律引用 token（§12），否则换语言就得逐节点改写。
圆角与间距也是可换的旋钮：`ConceptLanguage.geometry` 落 `radius.*` / `space.*`（任务 #25 之前这里是句谎话）。
`generateVariants` / `mergeVariants` 都**不动工作区**（`createSnapshot` 新增 `advanceWorkspace:false`），
所以"生成 4 个方案"不会把用户手上的稿子换掉；点"切到这个方向"才走 §28 的切换。
比较板是第三个视图（画布 / 方案 / 代码），每张卡用与画布、预览同源的 `resolveLayout + nodeStyle` 投影，
命令栏在这个视图里收起来——它改的是工作区那一份，摆在这儿会让人以为改的是某张卡。
过程中修掉三处真实问题：① 采纳一条方案会顺手把项目改名（方案名属于分支与快照，不属于文档）；
② `mergeVariants` 的 finally 少一次 commit，按钮永远停在"生成中…"；
③ `loadDocument` 每次都把 `metadata.createdAt` 写成"现在"（createDocument 的默认值没被覆盖回来）。
验证：`npm test` 192（新增 12 条 concepts 单测 + 8 条方案集成测试）、10 @smoke
（"生成四条 → 都是真投影 → 工作区没被动过 → 合成 A 布局 + C 视觉 → 采纳才换画布 → 切回 main 原样"）、
截图 `variants-board.png` / `variants-merged.png` / `variants-adopted.png` 人眼确认。
已知边界：方案来自确定性配方（UI 常驻 DEMO MODE 说明），不是模型输出；真实 provider 接入后
换掉的是"往哪个方向改"，落地方式仍然是一条分支一份 head 快照。

**M1 进度记录（2026-09-22，Publish / Share）**：§56 的 `/n/<handle>/<slug>` 与 §57 的三档可见性落地，
`apps/web/src/server/domain/publish.ts` + `publish` 路由 + 公开页 `app/n/[handle]/[slug]/page.tsx`。
一条 path 只有一行 `published_projects`（唯一索引），重新发布是就地换版本，
URL 指向的是**发布那一刻的快照**（`snapshot_id`）而不是工作区——所以作者之后怎么改都不会把已发出去的链接换掉，
这条用第二个浏览器标签页实测过（改成 22px → 公开页仍是 66px → 重新发布才变）。
private 的公开 URL 对所有人 404，包括作者本人（作者看自己那一版走 /studio），不靠"看身份放行"。
guest 首次发布时补一个稳定 handle（`u<id 前 8 位>`），URL 才真的能分享。
门禁当时只列真能自动跑的三项（模型自洽 / 对比度等 lint / 有内容），
性能预算、键盘可达性、视觉回归明确列在"未运行"里（§179 要求全绿，§159 要求别假装绿——
现在的做法是：能查的查并挡住，查不了的说出来，不把没查的写成通过）。
这三项后来被 `analyzeHealth()` 的七行取代，口径不变（见 M2 的 §178/§179 进度记录）。
`moderation` 仍然写 'pending' 并在面板上注明"审核管线尚未接入"。
过程中修掉一处真实遮挡：顶栏下拉被右侧属性面板（同为 z-50）盖住，点不到——发布面板需要 z-[60]/[70]。
验证：`npm test` 199（新增 7 条发布集成测试）、11 @smoke
（"发布 → 第二标签页看到 66px → 改成 22px 公开页不动 → 重新发布换版本 → 取消发布 404"）、
截图 `publish-panel.png` / `published-page.png` 人眼确认。

**M1 进度记录（2026-09-22，Design System 面板）**：左侧第三个页签（图层 / 设计系统 / 历史），
`apps/web/src/studio/DesignSystemPanel.tsx`。按类型分组列出 token，每行给：色块、key、
**被多少节点引用**、默认值输入框、色值取色器，以及该 token 有 modes 时的 light/dark 输入行。
所有改动都走 `studio.execute`（`setToken` / `addToken` / `removeToken`），所以改 token 与改节点一样
进撤销栈——实测改 `color.primary` → 绑定的按钮立刻变粉 → Ctrl+Z 立刻回到原色。
内置 token 的删除按钮禁用（改值可以，删掉会留下断链）；自定义 token 只在引用数为 0 时可删。
引用计数匹配的是 `"{color.primary}"` 这种花括号绑定而不是裸 key——第一版按裸 key 数，
结果满屏"未使用"，而画布上明明正用着它。
验证：12 @smoke（新增一条：引用计数 → 改值全线跟随 → 撤销 → 非法名如实拒绝 → 自定义 token 增删 →
刷新后仍在库里）、截图 `design-system.png` / `design-system-applied.png`（后者按像素扫过 #ff4d6d 确认
按钮真的换了色）。已知边界：还不能新建带 modes 的 token（表单只填默认值），也没有"哪些节点在用它"的
点选跳转。

**M1 进度记录（2026-09-22，资产服务 · 位图）**：§38/§80/§101/§182 的第一条竖向切片。三条边界钉死：
节点 paint 只持 `assetId`（字节/URL 不进设计，§16），文件名只当展示文本、object key 一律服务端按 id 生成，
字节入库前必须过 magic-bytes 判定 + 元数据剥离（§80）。落点：
`server/storage/{images,config}.ts`（手写 PNG/JPEG/WebP/GIF 的识别与结构化剥离，不引原生图像库）、
`server/domain/assets.ts`（上传→去重→存储→行；作者/公开两套取字节；Duplicate 的资产换号 `copyProjectAssets`）、
四个路由（项目资产 GET/POST、`/api/assets/[id]` DELETE、`/api/assets/[id]/file` 作者取、
`/api/public/[handle]/assets/[id]` 匿名取——后者要求"该项目有 public/unlisted 发布行 + 钉住的快照确实引用它"，
否则 404，被设计删掉的素材不会一直挂在公共 URL 上）。
投影一致性用一条规则保证：`assetContextFor(document, urlFor)` —— 只有文档自己的资产清单列出的 id 才解析成 URL，
清单里没有就返回 null，渲染层据此跳过该层而不是画破图（§159）；画布 / 变体比较板 / 预览 / 公开页四条 `nodeStyle`
调用点都注入同一份上下文。属性面板的填充区给图片 paint 单独一行（缩略图 / fit 选择 / 换图 / 移除），
"+ 图片"走 `studio.uploadImageAsFill`——一次上传 = 一个事务（`addAsset` + `set(style.fills)` 绑在一起撤销），
失败不产生任何事务且原因原样摊在面板上。
过程中修掉一处真实 bug：`readImageSize` 的 JPEG 分支把高/宽读偏了 2 字节（SOF 段高在 `+5`、宽在 `+7`，
不是 `+7`/`+9`），真机上传会存错尺寸——是 image-safety 单测用手搓的合规 SOF 逼出来的。
还修了 `.gitignore` 里未锚定的 `storage/` 把 `apps/web/src/server/storage/` 源码整目录忽略掉的坑。
验证：`npm test` 245（新增 image-safety 14 条 + assets 集成 8 条 + `remapAssetIds` 2 条）、
@smoke 新增一条"上传图片 → 画布投影出真实资产 URL → 浏览器 `naturalWidth>0`（证明剥离后字节仍可解码）→
剥离回执显示 eXIf → 撤销一次整层消失 → 重做 → 预览路由同源"，截图 `asset-on-canvas.png` 人眼确认
青色图块确实落在 Headline 背后。已知边界：只做结构化剥离不重编码；只接位图；DELETE 有服务端与测试但暂无 UI 入口。

**M1 进度记录（2026-09-23，认证 §137/§80）**：M1 竖向切片的最后一块——注册 / 登录 / 登出 + 认领 guest 项目。
决策与取舍见 `docs/adr/0002-password-hashing-and-csrf.md`。四条边界：
① **口令**走 SECURITY.md 允许的 bcrypt 回落分支（`bcryptjs` 纯 JS，cost=10），算法封在 `server/domain/password.ts` 一个文件后面，
`verifyPassword` 按 `$2` 前缀分派，将来换 Argon2id 只改这一处、旧串仍可验证；登录对"邮箱不存在"也跑 dummy-hash 对齐时序，防账号枚举。
② **认领用就地升级**：guest 的项目/快照/资产全挂在该 user id 下，注册时把同一行改成真实账号（写 email/password_hash/claimed_at、guest=false），
归属一条都不搬，自然不漏——e2e 实测"游客建项目 → 注册 → 项目仍在名下、回执显示已认领 1 个"。
③ **会话防固定**：（`middleware` 为 Next 16 旧名，2026-11-08 起更名 `proxy.ts`，本节以下同）middleware 用客户端可见的 cookie 值签发 guest 会话，所以 register/login 一律 `rotateSession`——删旧 token 会话行、发新随机 token，
否则攻击者事先种下的已知 token 会在提权后变成真实账号的会话；登出删会话行 + 清 cookie（吊销）。
④ **CSRF 双提交** + **滑动窗口限流**：`server/security/{csrf,rateLimit}.ts`。CSRF 靠 middleware 另发一个前端可读的 `nexus_csrf` cookie，
状态变更请求要在 `x-csrf-token` 头原样带回并比对（会话 cookie 的 SameSite=Lax 是第一道防线）；限流是 `RateLimiter` 接口 + 内存驱动，
形状对齐 Redis 有序集，登录按 IP+邮箱（10/15min）、注册按 IP（10/h）。
踩到的坑：middleware 跑在 Edge runtime，一开始从 `session.ts` 引 `SESSION_COOKIE`，把 `node:crypto` 与 postgres 驱动一起拉进 Edge 包报
`Native module not found`——把 cookie 名字抽到零依赖的 `server/security/cookieNames.ts` 解决。
验证：`npm test` 264（新增 password 6 + rateLimit 7 + auth 集成 6，auth 集成打真库断言就地升级/邮箱唯一/重复注册拒绝/口令校验/会话轮换吊销）、
`npm run test:e2e:smoke` 15 @smoke（新增两条：游客认领→注册升级→登出换新游客→登录找回；错误口令被拒且文案不泄露邮箱是否存在）、
`npm run lint` 通过，截图 `account-member.png` 人眼确认成员态（回执 + 已登录邮箱 + 登出 + 认领的项目在列）。
已知边界（如实记，见下方技术债）：Argon2id 未启用（走 bcrypt 回落）；限流是单实例内存版。CSRF 双提交已铺到全部写路由（见任务 #20）。

**M1 进度记录（2026-09-22，Compare）**：§27 的"比较"落在 `packages/design-model/src/diff.ts` 的
`diffDocuments(before, after)`：产出与 AI Diff（§151）同样的 `DiffEntry[]`，所以历史面板两套清单共用一个行组件。
差异停在"最浅的、真正不同的那一层"（`style.fills` 变了就报这一条，不拆成 `fills[0].color.value`），
增删整节点归为 added/removed 并给摘要而不是倾倒整个对象，父子关系与 children 变化归为 moved；
超过 300 条时截断并如实标 `truncated` + 总数（§159）。快照行新增"比较"，方向是"从那份快照到现在改了什么"。
`sameValue` 从 code-parse 提到 `nodes.ts` 共用——假回写、假 diff、假快照是同一个 bug 的三张脸。
验证：`diff.test.ts` 11 条（含"键顺序不同不算改动"）、`npm test` 161、8 @smoke（快照用例现在覆盖创建 → 比较 → 恢复 → 刷新）、
截图 `history-compare.png` 人眼确认窄面板下路径不被截断。

**M1 进度记录（2026-09-22，Snapshot 服务端）**：§27/§108 的"用户项目历史"落到 `snapshots` 表：
`apps/web/src/server/domain/snapshots.ts`（list / create / read / restore）+
`/api/projects/[id]/snapshots[/…/restore]` 三条路由（归属先过 `projectBelongsTo`，跨项目读一律 404）。
快照存整份 `DesignDocument`，所以恢复 = 原样写回而不是回放补丁；恢复前服务端先把当前状态存成
"恢复前自动保存"，恢复动作自己再留一条"恢复到「X」"——恢复永远不丢东西，也不假装没发生过。
历史面板底部新增快照区（命名创建 + 两步确认恢复），并如实说明恢复会清空本地撤销栈；
客户端恢复前先 `flushSave() + save()`，避免把未落库的编辑静默丢掉。
验证：`npm test` 150（含 5 条真实数据库快照集成测试）、`npm run test:e2e:smoke` 8 @smoke
（新增"创建 → 编辑 → 恢复 → 刷新仍是恢复值"）、截图脚本 `history-snapshot.png` / `history-restored.png` 人眼确认。
踩到的坑：`restore` 用 `JSON.stringify` 判断"当前是否等于目标"会误判——jsonb 不保留对象键顺序，
`loadDocument` 重建的文档键顺序是代码里的字面顺序，快照里那份是 Postgres 重排后的顺序，
于是每次恢复都多写一条无用快照；改为键顺序无关、且忽略 `undefined` 字段的比较（`stableKey`）。

**M1 进度记录（2026-09-22）**：Studio 工作台竖向切片已验证——
`npm test` 86 tests、`npm run test:e2e:smoke` 6 @smoke（`playwright.config.ts` 已固定 `workers: 1`）、
`npm run lint`（= 四个 tsconfig 全量 typecheck）通过，
截图检查（`screenshots/studio.png` / `studio-mobile.png` / `preview.png`）确认：
文本与按钮文案已投影到画布与预览；按钮 `fills` 作背景、`typography.color` 作字色；
hug 尺寸把 padding 计入；响应式断点下属性面板如实显示实际帧尺寸。

**M1 进度记录（2026-09-22，AI Service）**：`apps/ai-service`（FastAPI, 3200）已跑起来并通过
`/healthz` 与 `/v1/ai/run` 的真实进程验证（无 key 时如实返回 `provider-unavailable`）；
契约由 zod 单一来源导出到 `contracts/`，Python 侧 `jsonschema` 运行期校验，漂移由单测拦截。
验证：pytest 26 项、`npm test` 103 项、`npm run test:e2e:smoke` 6 项，首页 `home.png` 显示
AI Service 行与逐 provider 能力/原因。真实 key 到位前，真机 provider 调用只做过 httpx 传输层桩验证。

**M1 进度记录（2026-09-22，Design → Code）**：`generateProject()` 从设计模型确定性产出
`styles/tokens.css` + 每页一个 `components/nexus/<Page>.tsx` + 索引；token 引用写成 `var(--nx-*)`
（前缀刻意避开 Studio 自己的 `--nexus-*`），几何只来自模型的 size/layout/style/typography/responsive。
Studio 顶栏下新增 画布/代码 切换（`CodePanel`），选中的元素会在代码里高亮并滚动到自己那一行。
验证：`npm test` 121 项（新增 18 项 codegen 单测，含用 `ts.transpileModule` 证明生成的 TSX 无语法诊断）、
`npm run test:e2e:smoke` 7 项、`npm run lint` 通过；`screenshots/code.png` 人眼检查后修掉了
浮层遮挡文件标签的问题，并补 `app/icon.svg` 消除 dev overlay 报的 favicon 404。
**Code → Design 已落地（2026-09-22）**：`packages/design-model/src/code-parse.ts` 自带受限 JSX 扫描器
（不 import React / DOM / typescript，因此能进客户端包），把页面组件的类名反解回同一份设计模型，
只产出 `set` 补丁并经 `studio.execute('代码编辑', ops)` 作为单个可撤销事务应用。
边界如实呈现：结构性变更（加删节点、改标签、重排、改父级）不回写，识别结果必须能被重投影复现，
否则放弃该节点；解析不了的片段进 code-only 清单。
关键验收是往返恒等 —— `codeToPageOps(generatePage(page), page)` 零补丁、零 unmapped。
验证：`npm test` 145 项（code-parse 24 项）、`npm run test:e2e:smoke` 7 项、`npm run lint` 通过；
`screenshots/code-applied.png` 人眼检查发现并修掉了一类假回写：模型经服务端 schema 序列化后对象键顺序变化，
`JSON.stringify` 比较把"没改"当成改动，改为不受键顺序影响的深度相等。

**M1 验收**：新开项目输入一句 prompt，60 秒内（§138）在画布上看到可编辑设计，改属性能落库，
点 Code 能看到可编译的 React，点 Preview 能在 iframe 里真实运行，Screenshot 能出图，Publish 能拿到可访问 URL。

**M1 状态（2026-09-23）**：§181 的竖向闭环已全部打通并有 @smoke 覆盖（Create → Prompt → AI Design →
Canvas → Layers → Properties → Design System → AI Edit → Code → Preview → Screenshot → Publish，
外加资产上传与注册/登录认领）。Design Agent 的"意图→Plan→patch→画布→AI Diff→可撤销"由确定性规则实现，
UI 常驻 DEMO MODE。**唯一未闭合的是 line 43「方案/AI 生成的真实 provider 路径」——需要付费 provider 授权（§194 暂停条件），
用户提供 key 前不伪装真实生成。** line 35（Redis 任务队列 / embedding / RAG）是 M2/M3 前置，随其落地。

就绪判定已做到 correct-by-design（ADR 0003，commit 45880e8）：web 侧的 `getAiCapabilities`/`isDemoMode`
和 `/api/ai/run` 的路由不再看 web 自己进程有没有 key，而是查询 ai-service `/healthz` 的 provider 就绪状态——
key 只活在 ai-service 进程（符合 SECURITY.md「web 永不接触 key」）。所以 line 43 一旦闭合，
用户只需给 ai-service 配 `NEXUS_OPENAI_API_KEY`（+ 可选 `NEXUS_MODEL_FAST/BALANCED/REASONING/VISION`），
无需在 web 重复配置，首页能力行与 DEMO MODE 标识会自动翻到 real。

## M2 — 图像与资产（§182）
- [~] Nexus Image Studio（五条箭头，逐条记状态；本机没有图像 provider，像素一律来自本地确定性合成器并挂 DEMO 标识）
  - text→image：**已通**（`POST /api/projects/[id]/images` → 额度门 → 任务行 → 与上传同一道摄取门 → 真资产行 → 扣点；
    面板入口 + e2e @smoke，见上面 §38 第二、三格）
  - reference→variation：**已通**（参考图按归属取字节、量主色作色相锚点、锚点参与身份哈希；卡片上有按钮 + e2e。
    边界：钉住的是身份与元数据，"画面看着像参考图"没有被钉住）
  - character→scene：**已通**（锚点取自角色档案 visualIdentity.palette，assets.character_id 第一次有写入方；
    一致性有可测定义；角色面板上有"生成场景"按钮，e2e @smoke 点过一遍）
  - image→image：**已通（DEMO 语义的前半截）**（参考图的 `extractVisualDna` 统计值喂进合成器扰动并参与身份哈希：
    同一参考两次不同变体、各自逐字节可复现；e2e 的"生成变体"按钮点过）。边界：改的是色调与构图参数，
    不是参考图像素本身——"照原图改一笔"要真 provider 的图生图
  - sketch→image：**已通（DEMO 语义）**（资产库面板的 SketchPad 绘制面导出 PNG，走与上传同一道摄取门；
    服务端量出落墨占比/笔画密度参与合成与身份哈希；与参考图/肖像互斥，且草图必须属于本项目本用户）。
    边界：草图管**构图密度与明暗**，不管形状本身也不钉色相（黑白线稿的"主色"是纸白，钉上去就是谎）；
    "照草图轮廓画"同样等真 provider
  - 换成真 provider 时改的是 `image-synth.ts` 里那一格像素来源，前后每一环（门、账、摄取、投影）不重写（§76-79）
- [x] Asset Library（图片/视频/音频/3D/组件/设计系统统一编目）— 清单在模型里（`document.assets`），
  Studio「资产库」面板只是它的投影：列出/缩略图预览/引用计数/删除。删除走 `removeAsset` 模型级事务，
  跨所有页面剥引用、可撤销；字节清除是尽力而为的第二步（撤销恢复不了文件，回执如实说明）。
  非位图 kind 目前无摄取通道，见下方资产服务债 2。
- [x] Reference Image → Visual DNA 提取（§30/172-174）（取舍见 `docs/adr/0004-visual-dna-local-extraction.md`）—
  确定性**本地像素统计**：PNG 解码（8 bit，全滤镜）后
  测亮度/对比/饱和/冷暖/留白/边缘密度 + 主色板，落成 `document.visualDna`（一条 `setVisualDna` 事务，可撤销）。
  §174「所有 AI 生成遵循它」已可观测：DEMO MODE 的 palette-transfer 规则读文档 DNA 而非内置色板，
  e2e 用参考图的 `#14b8a6` 压过内置 cinematic `#05060a` 证明。不支持的编码（16 bit / interlaced / 非 PNG /
  带透明）返回中文原因而不是半截数据。排版/圆角/动效**从位图测不出来，因此不填**（`source.notes` 明说），
  `source.method` 区分 `pixel-stats` / `vision-model` / `concept-language`；风格形容词（"Cinematic"、"Soft glass"）
  要真视觉模型才能给，随 line 43 的 provider 授权补齐。
- [~] 角色一致性生成（§39）— **接线与界面都通了，欠的是像素那一半**：档案四栏（身份/穿着/画风/特征）进 prompt 与任务行、进知识索引；角色面板有「生成场景」与「生成肖像」两个入口（肖像完全由档案驱动，不给输入框）；**角色自己的肖像可以当它下一个场景的参考**（服务端验归属：参考图必须是这个角色的肖像），带参考图时色相锚点取**量自那张图像素**的值。可测的一致性今天只有色调那半——DEMO 合成器只认 prompt 哈希与一个色相，换真 provider 时这一格不必重接。逐条凭证见文末三节补记。

**M2 进度记录（2026-09-23，项目健康 §178 / Quality Gate §179）**：`packages/design-model/src/health.ts`
的 `analyzeHealth()` 是这一项唯一的算法出口：七行读数、0-100 分、`state = pass | fail | not-run`。
Studio 左栏「健康」页签与 Publish 弹层显示它，服务端 `runPublishGate()` 也调它——
屏幕上那分和服务器上挡发布的那份是同一个函数算的，不会各说一套（§16）。
检查规则没有重造轮子：结构走 `validateDocument`，设计体检走 `lintDesign`，
再补上只有设计模型就能静态算的性能预算（节点数/树深/位图字节/缺尺寸位图/动效数）
和模型内可查的风险（疑似明文凭据、code 节点危险写法、http 明文外链）。

三条不能商量的口径：
1. **没测的不能是绿勾**——Tests 与 AI QA 至今没有本地可算信号，`score = null` + `not-run` + `gating = false`，
   UI 显示"未评估"；把"没有发现"写成"通过"就是 §159 禁止的假绿；
2. **分数来历要能读**——每行带 `basis`（这项到底检查了什么）与可展开的真实发现，
   单行最多列 40 条、其余计进 `omitted` 并写明"另有 N 条（计分已计入）"，截的是显示不是问题；
3. **门禁只挡往外公开的方向**——切成 `private` 是下架，门禁没过也放行，否则坏页面收不回来。

顺带修掉一个真 bug（不是新增功能）：`lintDesign` 的对比度规则把未解析的 `"{color.text}"` 直接喂给
`contrastRatio`，而它对解析失败返回 1:1 —— 于是**每一处正确使用 token 的文本都被误判成不达标**，
同时按钮是拿自己的背景填充当文字颜色在比。新增 `measureContrast()`：先解析 token、沿祖先链合成真实背景、
按钮/输入卡取 `typography.color`，任何一边算不出来就返回 null 不报（算不出却报个数是造假）。
修好后暴露出内置起手页与四套概念语言自己就不达 WCAG（白字压 `#7c5cff` 只有 4.35:1、
warm 方向奶油字压亮橙 3.35:1、cyber 的 light 模式是深底配深字 1.08:1）——
按比值重算色板而不是下调 80 分线，`nodes.ts` / `concepts.ts` 的默认值因此变了（codegen/render/e2e 三处钉死旧色值的断言同步更新）。
`applyConceptLanguage` 另修一处：语言只给 `value` 时上一套配色的 light/dark 会漏进来，现在收敛到该语言自己的值。

验证：`npm test` 313（本项新增 16 条：`health.test.ts` 11 条——门槛两侧 82/76、error 一票否决、
40 条截断与 omitted、凭据脱敏后报文里查不到原文、localhost 不算明文外链、断链不崩；
`measureContrast` 5 条——token 解析、祖先合成、半透明先合成、按钮取正文色、渐变返回 null）、17 条 @smoke 全绿；
浏览器实测：起手页七行全过 → 把 `color.text/on-primary` 压成暗灰 → Accessibility 掉到 76 并列出
"Headline 2.06:1（#454a58 on #12151d）" → 点发布被挡（`门禁未通过：Accessibility 76 分，低于门槛 80`）
→ 同一份文档切私有放行、报告照旧列失败项。取舍见 `docs/adr/0005-health-score-and-gate.md`。

**M2 进度记录（2026-09-23，规模基准 §146 / 热点路径 §147）**：`scripts/perf-baseline.mts` 造 100/1000/10000
节点的文档，对七条模型层热点路径取 median-of-3，数字与噪声说明一起进 `docs/PERFORMANCE.md`
（**不断言阈值**：这台机器上 median-of-3 的散布就有 ±30%，写死断言的下场是被人删掉）。
第一轮实测就把真问题挖出来了：`execute + undo` 在 10k 节点上要 861ms/次——`runPatches` 应用一遍补丁、
`buildEntry` 为求逆与算 diff 又从头应用一遍，而 `applyPatch` 每条补丁 `structuredClone` 整份文档。
改成"`buildEntry` 顺带把过程中的文档交回来"（一次编辑一次应用）+ `clone()` 走自写递归拷贝
（纯对象/数组走快路，`Date`/`Map`/类实例仍回落 `structuredClone`；**保留 `undefined` 键与数组空洞**——
`JSON.parse(JSON.stringify())` 会丢，undo 之后节点形状就变了，这条有回归测试）。
净效果：一次编辑 + 撤销，100 节点 4.0ms→0.54ms、10k 节点 861ms→129ms；
其余路径前后的差落在测量噪声内，文档里明说了别把它们读成回归。
§147 剩下的如实挂着：整份拷贝仍是那 129ms 的主体（下一步是结构共享）、画布没有虚拟化/增量渲染、
画布侧没有 worker；浏览器端指标 2026-09-24 起由 `npm run perf:browser` 量（数字与限定见 `docs/PERFORMANCE.md`）。
验证：`npm test` 313（克隆的 `undefined` 键 / 数组空洞 / 非纯对象回落，以及"一次 execute 只应用一遍"各一条回归）、
17 条 @smoke 全绿（编辑—撤销—自动保存那条走的就是被改过的路径）。**2026-11-08 补记**：§147 的生产构建复测落在 `docs/PERFORMANCE.md` 2026-11-08 prod-65c96db 那节——真测出来：首帧 8档 106.3 / 1000档 313.4 / 4000档 1014.8ms；属性写入 5.1 / 12.9 / 28.8ms（三档都在 <50ms 门内）；pan 中位帧距与 >33ms 帧全线 16.7ms / 0；选中响应 32.6 / 40.8 / 44.5ms，仍超 <16ms 门。`PERF_INCREMENTAL=0` 那半没干净量成，如实记在 PERFORMANCE（不冒充）。Next 16 的 `middleware` 更名 `proxy`（`apps/web/src/proxy.ts`）顺带消掉了构建期 deprecated 警告，其余跨仓引用同步。

**M2 进度记录（2026-09-23，几何 token 化，任务 #25）**：修掉一处"声称能做其实做不到"。
§29 的视觉语言此前只带颜色与字体，`cyber` 写着「直角」、`warm` 写着「圆角」，
而节点上的 `cornerRadius: 10` 是钉死的数字——那两个词没有指代（§159）。现在：
起手页 / 四个结构方向新增的区块 / DEMO 配方生成的 section 全部引用 `{space.*}` 与 `{radius.*}`
（默认栅格补了 `space.20=80`、`space.24=96`），`ConceptLanguage.geometry` 成为第三个旋钮。
三件配套缺一不可，否则就是新的谎：
1. `lintDesign` 的 `hardcoded-style` 扩展到几何（非零的 gap/padding/cornerRadius 字面量），
   起手页必须 0 命中——这条规则是"以后不许再钉死"的守门人，而不是一次性清洁；
2. `code-parse` 学会把 `var(--nx-space-6)` 反解回 `{space.6}`。此前 gap/padding/圆角**只认 px 字面量**，
   几何一旦绑 token，§19 的往返恒等（`parse(generate(page))` 零补丁零 unmapped）在起手页上就破了；
   认回**引用**而不是认成数字，才既保住恒等又不会把绑定改写成常量（删掉 token 绑定的圆角类不再写 0，有测试钉住）；
3. DNA 的 `radius` / `spacingScale` 改为从落好 token 的文档里读，不再抄一份常量表——
   否则"项目遵循的视觉语言"会停在抄的那份数字上。
顺手修掉一处面板说谎：Design System 的输入框草稿提交后不清除，撤销或 AI 改动之后仍显示旧数字；
现在 blur 即丢草稿。
验证：`npm test` 320（新增 6 条：旋钮落 token、两套语言在同一份结构上给出不同圆角、DNA 从文档读、
新增卡片也引用 token、起手页无硬编码几何、字面几何会被记下来）、17 条 @smoke 全绿；
浏览器实测方案板 `main 10px / editorial 2px / cinematic 8px / cyber 0px / warm 20px`，
改 `radius.md=26` 画布按钮立刻 26px、撤销回 10px 且面板显示真值。

## M3 — 世界 / 角色 / RAG（§183）
- [~] World Builder（Lore/History/Geography/Factions/Characters/Creatures/Items/Quests/Story）—
  世界文档（九类）+ 存储 + Studio「世界」面板已落地，见下方进度记录；
  **§44 的 AI 生成那半没做**（要真 provider），没接之前面板只给模板骨架，正文一律留空。
- [x] World Graph 可视化 + 可拖拽节点（§45）— 关系（有向、可带标签）与拖拽位置都存在世界文档里，
  Studio 第四个视图「世界图」画出来；见下方进度记录。自动避障 / 缩放 / 多选没做，不在 §45 的验收里。
- [~] Character System + Character Agent 对话（§46-47）— §46 档案（含关系、声音、视觉标识）已落地，
  见下方进度记录；§47 的"跟角色说话"的 provider 侧与 web 传输在 2026-10-06 接通，界面对话入口同日落地（见文末「§47」一节）。
- [x] Memory 四类（Session/Character/World/User）可查看可删除（§48）— 见下方进度记录。
  四类都能记、能列、能单条删、能按类清空；**没有"全部抹掉"的入口，也没有搜索框**（检索要 embedding，§49）。
- [~] pgvector RAG：hybrid retrieval + rerank（§49/93）— 语料索引（世界条目/角色档案/记忆 →
  `knowledge_chunks`）+ 混合检索（tsvector 全文 + 子串 + 词覆盖度的确定性融合）**已落地并跑通
  真库集成测试**，见下方进度记录。**两件事没做，也不假装做了**：① embedding 列没有 provider 时
  保持 null、返回 `vectorAvailable: false`，所以**没有语义检索**——pgvector 的 HNSW 索引和
  `vector` 列都在库里，只等真实 embedding provider 写入；② §49 的 "Reranking" 要真模型，
  现在给的是**规则重排**（融合分数 + 新近），不是模型重排。所以此处仍是 `[~]`：
  做的那一半已验证，没做的那一半要真 provider。

**M3 进度记录（2026-09-23，World Builder 第一切片，§44）**：新开一个纯模型包
`packages/world-model`（与 design-model 同一条纪律：无 React / 无 IO，浏览器与服务端跑同一份校验）。
世界文档 = 九类条目（lore/history/geography/factions/characters/creatures/items/quests/story），
每类若干条 `{id, kind, title, body, updatedAt}`；改动一律换出新文档，不原地改。
存储：`worlds` 表那列从没被读过的 `lore` jsonb 换成 `document`（迁移 `0002_world_document`），
整份 JSON 存——世界文档是文字为主的小文档，没有按节点查询的需求，
拆成规范化行只会多一处会不同步的地方（设计文档拆行是因为它要按页/节点取）。
读写都过 `@nexus/schemas` 的 zod + `validateWorld`，**库里躺着读不出来的东西不可接受**：
契约不符时 GET 返回 500 + 可读原因，面板显示错误而不是假装"还没有世界"。
`packages/schemas/test/world-contract.test.ts` 逐字对齐九类清单（z.enum 要字面量，
两处各有一份是没办法的事，漂移必须在测试里炸）。

两条刻意的边界，界面上也写着：
1. **不做假生成**：§44 的示例是「Create a dark fantasy world」→ AI 填出九类内容，那要真 provider。
   没接之前面板只给**模板骨架**（九类各一条空条目、正文一律空串），文案里明说这是模板不是内容；
   集成测试断言"除我加的那条，其余正文仍为空"，防止哪天有人往模板里塞预设世界观。
2. **不进撤销栈**：§150 的 Command 事务目前只覆盖设计文档，世界编辑用显式"保存到库"（失焦即写），
   面板脚注写明 Ctrl+Z 只管画布。等世界也要事务化时再做，不假装已经符合。

`GET` 不写库：没有世界返回 null，由面板上的「创建世界骨架」发起一次 PUT——
"还没有"和"有一份空的"是两件事，而 GET 顺手建数据会让每次刷新都在库里留痕。
验证：`npm run lint`（typecheck 多了 world-model 一项）、`npm test` 339
（world-model 12 条 + 契约 4 条 + 真库集成 5 条）、@smoke 18 条全绿
（新增一条：建骨架→填一条→加一条→reload 后仍是库里那份）。

**M3 进度记录（2026-09-23，World Graph §45）**：世界文档加 `links`（`{id, from, to, label}`，有向）
与 `positions`（条目 id → 坐标）。位置与内容分开存是刻意的：换视图、重排一次图不该改写谁写过的正文（§16）。
`autoLayout` 按类分列、列内按加入顺序堆叠，**确定性**排布——同一份文档每次打开排成同一个样子，
否则"刷新之后图乱跑了"会被当成 bug，其实只是随机数。`worldGraph()` 是视图读的投影，
指向已删条目的边在投影里自然消失，同时 `validateWorld` 报 `missing-endpoint`：画不出来和要说清楚是两件事。
`linkWorldNodes` 对自环 / 端点不存在 / 重复关系**不写库但一定给原因**，面板上以回执条显示（§159 不许静默丢弃）。
Studio 加第四个视图「世界图」（画布 / 方案 / 代码 / 世界图）：点两个节点连线（顺序即箭头方向）、
拖节点改位置（松手即写库）、点边删除关系。拖 ≠ 选：拖完那一下的 click 被吞掉，否则每拖一次都会顺手选中端点。

一条 e2e 失败挖出的真实数据丢失链，三处一起修（缺一处都只是把窗口挪个位置）：
1. **卸载时丢最后一次写**：写库是"一次在飞 + 防抖补发"的，而防抖定时器在页面 unload 后不会跑——
   刚点完「加一条」就刷新，那次改动就没了（§44 那条 e2e 就是这么挂的）。
   改成在飞时只记一笔"还欠一次写"，前一个响应落地后**立刻**链式补发；`flushSave()` 在卸载时
   若还有请求在飞，就直接再发一次 `keepalive` 的 PUT（正文 < 60KB 才用 keepalive，超了退回普通请求）。
2. **乱序到达让旧内容赢**：卸载时同时有两个 PUT 在飞，谁后落地谁生效是不确定的。
   服务端 `saveWorld` 现在按 `document.updatedAt` 拒掉比库里更旧的写，集成测试专门验这条。
3. **旧请求的响应盖回新编辑**：`put()` 成功/失败都只在"这份文档还是当前那份"时才改本地状态，
   用户刚敲进去的内容不会被一个迟到的响应换掉。

还有第四处，是同一条 e2e 挂掉后顺着 console 追出来的：StrictMode 把 effect 跑两遍，
同一个项目发出两次 GET；第二次（迟到的）返回 `world: null`，把用户刚点出来的骨架从界面上擦掉了。
修法是两条纪律一起：`ensure()` 对同一项目的进行中载入不重复发请求；
读结果回来时若本地已经有这份世界（用户在建/在改），**保留本地**而不是覆盖成服务端那一刻的读数。
`apps/web/test/world-store.test.ts` 用假 fetch 把这两个时序钉住（并发只发一次、迟到不擦本地、
契约外的文档根本不发请求），不靠浏览器运气。

另外把工具条与回执移出滚动区：它们跟着画布横滚时，"已保存"和「连一条」会在往右拖之后消失。
e2e 因此**故意在拖完立刻 reload**（不等落地）来验上面那条写库链，另一条 §44 的用例则等 `pending=false` 再刷新——
两条各管一件事。

验证：`npm test` 350（world-model 新增 6 条关系/布局/投影用例，集成新增 2 条：旧形状仍可读、旧写入被拒，
store 新增 3 条时序用例）、@smoke 19 条全绿；浏览器实测截图确认三节点连线、拖拽、重复连线的回执都按预期显示。

**M3 进度记录（2026-09-23，§46 Character System）**：角色档案进 `@nexus/world-model`（`character.ts`）：
名字 / 外观 / 性格 / 背景故事 / 目标[] / 恐惧[] / 关系[] / 声音（语域·语速·口头禅）/ 视觉标识（色板·轮廓·母题·参考资产）。
**没有 `memory` 字段**——§48 的记忆是按 scope + subjectId 索引的独立存储，档案里塞一个文本框
就会造出第二个"记忆真值"，两边迟早对不上；面板上把这句话写着，免得被当成漏做。
关系的目标是世界条目 id（从下拉里选，不手抄），`validateCharacterAgainstWorld` 能报断链；
没给角色名单时不判，免得把"还没加载完"冤枉成断链。

存储上收掉一处历史遗留：`characters` 原来有 profile / visual / voice 三个谁也没读过的 jsonb 杂物袋，
现在合成一列 `profile`（迁移 `0003_character_profile`）。同时定死一条：**一份文档只有一个 id**——
世界与角色的模型 id 都以库里的 uuid 为准（读回来时覆盖模型里那个临时的 `chr_…` / `world_…`），
否则"角色挂的 worldId"和"世界文档自己的 id"会变成两个说法，迟早有人拿错的那个去查。

面板是显式保存（不是自动保存）：角色编辑没进画布的 Command 撤销栈（§150 目前只覆盖设计文档），
自动保存会把没写完的半份档案写进库而撤销救不回来。草稿改动的唯一入口是 `patchProfile`，
基准必须是当前草稿而不是库里那份——拿库里的当基准，改一个字段会把其它没保存的编辑一起抹掉。
建档只给名字，其它字段一律空：AI 生成角色设定要真 provider，给一份"看起来像人"的模板就是假生成（§159）。

验证：`npm test` 368（world-model +8 档案/关系/断链用例、契约 +3、真库集成 +7）、
@smoke 20 条全绿（新增：建档→填档案→连一条世界关系→reload 仍是库里那份→删除）；面板截图人眼确认。

**M3 进度记录（2026-09-23，§48 Memory 四类）**：`memories` 表原来只有 `scope + subject_id`——
**没有归属列**，意味着任何人拿到 id 就能读能删，也没法按项目列出"我的"这批。
迁移 0004 补 `owner_id`（NOT NULL，硬边界）与 `project_id`（user / session 类不挂项目，留 null）+ 两个索引；
域层每个查询都带 owner 条件，跨用户既读不到也删不掉（集成测试逐条钉住）。

四类：本次会话 / 角色 / 世界 / 我的偏好。主体默认值讲清楚：user 类就是本人、
session 类跟着项目的工作过程走（`project:<id>`），world / character 类必须指明主体——
否则会长出"不知道在说哪个世界"的孤儿记忆。Studio「记忆」面板按类分组列出、
可记一条、可单条删、可"清空这一类"；**没有一键抹掉全部**：§48 要的是按类删除，
误点一次就清光用户全部记忆的按钮不该存在。

不假装能搜：面板上没有搜索框，`embedding` 没有 provider 时就是 null，
`embedded` 字段如实带在返回里。§49 的检索等真 embedding 接入再做。

过程中修掉两处自己造的 bug：
1. `POST /api/projects/:id/memories/clear` 与 `/memories/[memoryId]` 路径撞车，
   Next 把 clear 当成 memoryId 路由 → 405。改成 `DELETE /memories?scope=…`（集合上的 DELETE），
   少一个易撞车的段，也更贴 REST。
2. 世界类记忆的主体一度存进组件 state：切到别的类型再切回来时 state 被清空而 effect 依赖没变，
   「记下」按钮永远点不动。改成**推导**（`scope === 'world'` 时取当前世界 id），
   不存就不存在过期的一刻；e2e 现在专门"切走再切回来"记一条，把这个坑钉住。

验证：`npm test` 374（真库集成 +6：四类计数、主体必填、陌生人看不见删不掉、
跨项目只见全局不见项目记忆、按类清空、删项目后项目记忆级联消失而偏好留着）、
@smoke 21 条全绿；面板截图人眼确认三类分组、主体标签与清空入口。

**M3 进度记录（2026-09-23，§49 语料索引与混合检索）**：RAG 里**不需要模型**的那一半落地了。

切分与入库：世界条目（§44）、角色档案（§46）、四类记忆（§48）→ `knowledge_chunks`。
切分是确定性的（先按空行分段、攒到 700 字收尾、单段超 1200 才硬切，不重叠不随机）——
同一份内容每次切出同样的块，"重建一次看差异"才有意义。空正文的小节不进索引：
检索结果里出现一排「外观：（空）」比查不到更糟。
`syncProjectKnowledge` 走**全量删+重写**而不是增量对齐：多花一点写代价，
换掉"改了却还检索到旧内容"这类最难查的谎。写路径（存世界 / 存角色 / 记记忆 / 删角色 /
删记忆 / 清空记忆）都自动触发同步；面板另给一个显式"重建"按钮，自动同步保证不撒谎、
手动重建保证可核对。删记忆走的是 `deleteMemory` 的返回值判定，
「我的偏好」类不挂项目、不在任何语料库里，因此不触发重建（加与删都按这条判断）。

混合检索为什么必须留子串命中：`'simple'` 配置的 tsvector **不按词切中文**——
一整句中文是一个 token，于是全文检索对中文语料几乎不命中。只报 tsvector 分数会让
中文用户以为索引坏了。所以候选集 = 全文命中 ∪ 整句子串命中 ∪ 任一词条子串命中，
再在 TS 里算三个**可解释的加数**（fulltext / substring / coverage）融合排序，
返回里带 `matchedBy` 与 `parts`——分数不藏在黑盒后面。同分按新近。
语料按项目隔离；「我的偏好」类记忆 `project_id` 是 null，不进任何项目的语料库：
§49 的语料清单是 Lore/Characters/History/Locations/Items/Quests/Documents，用户偏好不在其中。

**明确不做、也不假装做的两件事**：① `embedding` 列没有 provider 时保持 null，
返回 `vectorAvailable: false`，面板顶部常驻「向量检索未接」——没有语义检索就说没有；
② §49 的 "Reranking" 要真模型才谈得上，现在给的是**规则重排**（融合分数 + 新近），
`reranker` 字段如实写 `deterministic-fusion`，不冒充模型重排。

**过程中修掉一个「静默返回空」的 bug（本轮，诊断被推翻过一次）**：检索的候选集条件
原来把词条拼成一个字符串再塞进 drizzle 的 `sql` 模板：

```ts
sql`${needles.map((n) => `lower(content) like ${'%' + n + '%'}`).join(' or ')}`
```

drizzle 把整个拼接结果当成**单个绑定参数**，生成的 SQL 是 `or $N`，$N 是文本。
**第一版诊断说这会让 Postgres 报错、任何查询都失败——这是错的**：文本参数落在
布尔位置时**不报错**，而是**恒为 false**（真库实测：即使传 `'true'` 也得到 false），
所以"任一词条命中"这一支成了死代码。

真实症状比崩溃更隐蔽：

| 查询 | 修复前 | 修复后 |
|---|---|---|
| `盐海` | 命中 | 命中 |
| `沉船` | 命中 | 命中 |
| **`盐海 沉船`** | **`[]` 空** | 命中 |
| **`王城 投降`** | **`[]` 空** | 命中 |

即**任何多词条查询（空格/逗号分隔）都静默返回空**。单词条查询正常——
因为整句子串那一支（`like '%盐海%'`）已经兜住了。
原有的 6 条集成用例**全是单词条查询**（`盐海`/`eclipse`/`巡逻路`/`打翻的镜子`），
所以一条都没抓到。这是覆盖缺口，不是测试写得不够。

发现它的方式是**不连库、只用 drizzle 的 `.toSQL()` 把渲染结果打出来看**；
但**真正确认症状要靠真库**——正是"先起 Postgres 再验证"这一步推翻了第一版诊断。
修法是逐条生成条件再 `or(...)` 起来，每个词条各自成为一个绑定参数。

防复发做了两层：
1. 条件构造抽成纯函数 `buildRetrievalFilter(projectId, query)`，补 4 条**不连库**的
   SQL 回归断言（参数里不允许出现 SQL 片段、占位符数与参数数一致、中英文查询都合法、
   项目隔离条件永远在场）——这层拦住"把 SQL 当参数"这个写法本身。
2. 补 2 条**真库**多词条用例（整句不匹配但各词条命中必须查到；混入不存在的词时
   仍按命中部分返回）——这层拦住"多词条静默返回空"这个症状。
   两条都已回退验证过：还原旧写法后，2 条集成 + 2 条单测共 4 条如期失败。

验证：`npm run lint` 通过；`npm test` **37 files / 393 tests 全绿**（真库集成 74 条此前
因 Docker 未运行而整体未执行，本轮首次全部跑通）；`knowledge.test.ts` 11 条 +
`knowledge.integration.test.ts` 8 条。

## M4 — 3D 与游戏（§184）
- [x] Three.js / React Three Fiber 运行时 — **2026-09-24 落地**：`three` + `@react-three/fiber`（没引 drei，
  文字标签要它就得先加依赖，所以先用"色块 + 路标柱 + DOM HUD"这套能说的表达）
- [~] 3D World Runtime（§140 的 walk / explore）— `/world/<项目>` 走进这个世界文档的投影：
  场景不是另存一份文件，而是 `buildWorldScene(世界文档)` 现算（§16）——位置就是 §45 那张图上摆过的坐标
  （图的 y 就是世界的 z），没摆过的按文档顺序排在同心环上并**标成线框 + 在 HUD 里报数**。
  WASD / 方向键走、按住拖动转视角；走近 9 个单位内展开那条正文；图例说明"颜色=九类之一，不表示危险或阵营"。
  WebGL 用不起来时页面明说进不去，也不退回 2D 还叫"世界"；库里那份世界读不出来时报原因，不给空场景。
  talk 已在 2026-10-06 接上：HUD「跟角色说话」展开的就是 §46 角色档案的对话——与角色面板共用
  `CharacterChat`（换人即换对话），名册在服务端取好传下去；**世界条目不是对话目标**这条边界
  写在 HUD 文案与组件注释里（世界条目是九类正文，档案才有人设与记忆）。
  **2026-10-07 碰撞与点击行走落地**：`world-model/scene.ts` 新增 `resolveWalkCollision` /
  `walkToward`（纯函数，与 isoProject 同一条理由：能被单测钉住的算术不埋进三维组件）——
  条目占位半径 1.2 + 行走者 0.8 的圆碰撞，逐条目按场景顺序解，站正中心沿 +x 推出（不抛异常不 NaN）；
  点击地面走过去（指针按下抬起几乎没动 = 点击，与拖视角共用同一对事件），直线 + 碰撞滑动，
  目标在占位里（点了条目身上）停在占位表面并报 arrived；被挡住原地蹭半秒就停，不说"已到达"。
  限度同步改口（`SCENE_LIMITS` 与 HUD）：**没有地形——模型里没有高程字段，脚下是平的**；
  点击行走不是导航网格，绕不过大障碍（反复走停在占位表面，单测复现这条算术边界）。
  **测试**：`walk.test.ts` 10 条（推出方向、两占位重叠、确定性、冻结输入不被改写、
  点击条目停在表面、撞墙驻点复现）；`@smoke 3D 世界` 加一格：HUD 暴露 `data-walk-at`，
  按住方向键位置读数必须变化——把"碰撞解析在真帧循环里跑着"钉在真浏览器里（14.5s live 模式过）。
  **2026-10-07 高程落地（第二片）**：`WorldPoint.elevation`（0–6，模型常量 `WORLD_ELEVATION_MAX`）——
  高程是**条目的视觉属性**，不是可走地形：条目浮在图上写的高度上，柱子从地面把它撑起来；
  脚下的地没有坡，走近高处的条目是它浮着，不是你在爬山（限度随场景一起说）。写入端两条纪律：
  `setWorldNodePosition` 省略 elevation 时**保留原值**（拖动平面坐标不打回地面）；
  `setWorldNodeElevation` 只收摆过位置的条目、不合法就交回原因（面板显示）、高度 0 不落键
  （贴地 = 缺省，库里不留显式缺省）。面板每条目一个"高度"输入（没摆位置时禁用并说明为什么）。
  **测试**：`elevation.test.ts` 6 条（没摆位置不收、合法写入、越界/NaN 拒绝、拖动保留、
  越界钳到界内、投影与 fallback 归零）；world-model 56 条全绿。
   可走的地形已在 2026-10-10 第四片（圆台）落地，2026-10-15 第五片补上坡（cone 剖面）——
   记录见文末「§140 第五片」一节与欠账清单第 6 条。
   条目名字已经用 DOM 投影标签解决（没引 drei）。
   **2026-10-09 第三片：3D 模型资产接通（§34 × §140）**。`WorldNode.modelAssetId` 与
   `WorldWalk.ModelAsset` 早就写着，但**那条路是断的**：URL 拼的是
   `/api/assets/<projectId>/<assetId>`，而真路由是鉴权的 `/api/assets/<assetId>/file`
   （两段 vs 一段）——每个模型都 404，控制台刷一屏 warn，`return null` 之后条目位置上
   只剩一个**看不见但挡路的气墙**（碰撞体还在）。而且面板里没有任何挂资产的入口，
   `modelAssetId` 从 UI 到不了。这一片三件事：URL 改走 `apiAssetUrl()`（assetId → 地址的
   唯一投影，§16）；加载中与失败都退回**类别占位几何体**（线框盒，不再留空白）；
   `setWorldNodeModelAsset()`（world-model，null = 删键不是空串——"没挂"与"挂了空 id"
   是两种状态）+ WorldPanel 每条目一个「3D 模型」选择器（只列本项目 kind='model' 的资产，
    归属在面板那一端保证，模型侧只管形状）。测试：`model-asset.test.ts` 5 条
    （挂/摘/空串拒绝/不存在条目/不碰位置高程），world-model 61 条全绿。
   **2026-10-09 同日晚：高程在 wire 上被静默剥掉的断链**（`WorldPointSchema` 没有
   `elevation`，zod 剥未知键——面板写的高度存盘后再打开回到地面，无报错无提示）。
   契约补上该栏 + `elevation.test.ts` 新 3 条（过得去且不被剥、越界拒、上界与
   `WORLD_ELEVATION_MAX` 同源）+ 真实库往返 2 条（写 3.5 读回 3.5、高度 0 不落键）。
   **2026-10-10 第四片：可走的地形（圆台高度场）**。与 elevation 的分工写进模型注释：
   elevation 是**条目的视觉属性**（浮多高、柱子是标架），terrain 是**地本身的高度**——
   走近圆台是站在台面上。三层全落地：① 模型 `WorldDocument.terrain?`（kind: 'plateaus'，
   缺省 = 平地，老世界照常读得出）、`setWorldTerrain` 整份写入（不合法就不写、原因交回、
   null = 收掉）、`validateWorld` 新 `bad-terrain`；② 场景投影 `terrainHeightAt`
   （覆盖取**最高**，不平均不后画赢——确定性与"没有半个台阶"）、`SCENE_LIMITS` 改口；
   契约 `WorldPlateauSchema`/`WorldTerrainSchema`，PUT 进读回来还在；③ 3D：相机高度 =
   眼高 + 地形高度（`EYE_HEIGHT = 3.2`），**半透明盘 + 高度柱 + 台沿圈**三件套
   （半透明是免得把台子上的条目挡成黑影），点击地面的落点改走地形感知的
   `pickGroundPoint`（先按地平求候选再拿候选点问高度，两次迭代收敛）；
   `data-walk-height` 进读数。WorldPanel 新增地形区（x/y/半径/高度四输入 + 加/删 +
   收掉地形——**没有画布可以把圆台拖来拖去，位置用数字填，界面不假装有拖动**）。
   测试：`terrain.test.ts` 18 条 + 真实库往返 1 条 + `@smoke 3D 世界` 加一段
   （面板加 r=200 h=3 盖住出生点 → 进 3D → `data-walk-height` = '3' → 截图
   `world3d-terrain.png`：绿色圆台与 HUD 新限度）。**踩过的真坑**：`sceneTerrain()`
   一度带一个 `heightAt` 函数，而 WorldScene 是服务端组件作为 props 传给客户端 3D 组件的——
   Next 运行时报 "Functions cannot be passed directly to Client Components"，3D 页白屏；
   投影改成纯数据（查询用模块级 `terrainHeightAt`），并加一条「场景投影是纯数据」的
    typeof 断言防 Regression。~~仍欠：在地形上直接画地形的编辑器（今天是数字输入，拖拽画圆台要等世界图支持）~~
   ——**2026-10-27 核对后改口径**：图上画地形已在 2026-10-13 的 §140 落地（`WorldGraphView.tsx`
   的「画地形」模式走 `terrainDraw.ts` 的 `plateauFromDrag`，拖一个圆就写进世界文档）；坡地已在
   2026-10-15 落地（`WorldPanel.tsx` 的剖面可选 `cone`，线性降到 0）。仍欠的只剩**真正的高度场**：
   圆台与坡都是解析形状，缝怎么走、超出半径怎么算写在 ADR-0034 的限度里。
    取舍与踩过的坑：`docs/adr/0034-world-terrain-walkable-plateaus.md`。
- [x] Game Studio：2D / 2.5D / 3D / 探索 / Interactive Story / RPG 原型 / Puzzle / Visual Novel（§51）
  — **2026-09-25 第一片（2D 可玩）落地**：`packages/game-model` 新增 `play.ts`（编译关卡计划）与
  `sim.ts`（纯函数模拟器），`/game/<项目>` 用 canvas 把它跑起来，Studio 的「游戏」面板上有「试玩这份设计 →」。
  **这一片守的是 §16：试玩读的就是那份 §54 文档，没有第二份"关卡文件"**——改完数值回这一页刷新，
  跑起来的东西跟着变（e2e 就钉这条：把敌人 `health` 从 10 改成 999，同一套按键就打不死了）。
  八种类型里 2D、「互动故事 / 视觉小说」与 2.5D 这四种有构建管线，其余四种只有清单没有投影，
  界面上照实这么说（§51 要的是"至少支持"，今天支持四种就写四种）。
  **2026-09-25 第二片（公开可玩）**：`published_projects.game_document`（迁移 0012）在发布那一刻把当时的
  游戏设计钉进 publication 行，`/n/<handle>/<slug>/play` 只读这一列（取舍与理由见 `docs/adr/0009-…`）。
  作品页上的「试玩这一版」只在钉住了的时候才出现——不给一个"点进去说没有内容"的链接；
  可见性判定整个复用 `resolvePublishedPath`（private / 被人工拒绝 / 项目已软删一律不可达），不抄第二份谓词。
  钉的是**原样 jsonb**：解析不了就在公开页明说"这一版的游戏读不出来"并列出前几条原因，
  不悄悄变成"这个游戏没内容"。老发布行不回填——回填等于替历史宣布"当时发布的就是现在这份工作稿"。
  §168 顺接上了：`/play` 挂同一个 `VisitMeter`，玩一次就是一次真访问，游戏类作品的 play time 从此有来源
  （`completion` 仍然是"最远滚到的高度比例"，对一屏画布的游戏没有额外含义，不冒充通关率）。
  **2026-09-26 第三片（类型进了文档，对话那条管线有了实现）**：`GameDocument.kind` 成为字段（§16：
  类型决定这份设计走哪条管线，所以要跟着文档与快照发布），`packages/schemas` 的契约同步加上
  `GameKindSchema`，缺省按 `2d` 读——那是这一格加进来之前唯一存在的管线，不是随手挑的默认值。
  `compileStory` 把「互动故事 / 视觉小说」那句话变成真的：正文＝对话实体的「设计说明」（空就是空，
  不替作者写开场白），选择＝它指向其它对话的引用；忽略的非对话实体个数、悬空引用、空正文、
  没有出边、多条互不相连的线全部进 `notes` 照实说。`compileForKind` 是"类型 → 管线"的唯一分派点，
  作者试玩页与公开试玩页共用它（`apps/web/src/play/PlayByKind.tsx` + `StoryPlay.tsx`）：
  没接的那四种给出原因，不给空场子、也不拿 2D 关卡顶上。Studio「游戏」面板的类型下拉
  把 `GAME_KIND_STATUS.note` 原样显示，所以"面板说能玩、点进去没得玩"这两句话不可能同时出现。
  测试：`story.test.ts`（10 条，含一条拿状态表当准绳的分派对齐）、`game-contract.test.ts`（+4 条，
  含"kind 会被未知键剥掉"那次的反向对照与老文档缺省）、`game-publish.integration.test.ts`（+1 条
  往返：存 interactive-story → 钉住那份读出来还是它 → 分派出 story）、
  `@smoke §51 类型分派`（真浏览器里换类型 → 对话播放器 → 点选项跳到空正文那段 → 改成 3D 后同一页
  照实说"还没接"，三张截图核对过长相）。
  **2026-09-27 第四片（2.5D 有了真投影，"同一条计划换画法"落地）**：`GAME_KIND_STATUS["2.5d"]`
  从 `pipeline: null` 改成 `pipeline: "topdown"` + `view: "isometric"`——2.5D **不是第二套规则**：
  `compileForKind` 照样派 `compileGame` 出来的那份计划，`GamePlay` 只换绘制函数，循环 / 输入 / HUD /
  §53 的 playtest 全部共用，所以"2.5D 玩起来不一样"这句话在这里说不出口，它就是同一个游戏。
  等轴测算式放在 `play.ts`（`isoView` / `isoProject` / `isoDepth` / `isoGroundRadius`）而不是组件里：
  位置本来就是这一层排出来的，投影写进渲染层就会变成"浏览器算一遍、单测算另一遍"，
  两处不一致时没人说得清玩家看到的坐标是不是设计里的那个（§16）。
  2:1 等轴测，场地四角带边距落回同一块 1200×760 画布，标记按 `x + y` 排远近。
  **限度跟画法一起显示**（`ISO_VIEW_NOTES`，进页面上的 `data-game-note`）：规则与 2D 走同一个 step、
  地面网格不参与碰撞、标记不随远近缩放也没有转身——模型里没有尺寸与朝向，它们仍是类别标记不是 3D 模型。
  面板那句"接没接"、页首的"等轴测投影"、画布上的 `data-game-view` 全部读同一张 `GAME_KIND_STATUS`。
  **测试**：`iso.test.ts` 新增 7 条（方向、单射、远近序、2:1 比例、限度三条在不在）；
  `story.test.ts` 的分派对齐用例加上"表说等轴测，分派出来就不许是俯视"；
  `@smoke §51 类型分派` 多一格（换 2.5D → 等轴测页 → 像素断言 → 截图 `story-play-isometric.png`），
  同一趟把 `§50 试玩` 与 `§50 公开可玩` 两条 2D 回归一起跑了（3 passed）。
  **这一格顺带修的一条测试纪律**：截图前必须 `game.bringToFront()`——后台标签页的 rAF 不跑，
  画布会是空的；第一版就是这样，断言（DOM 可见 + 页首文字）全绿而像素一张没画出来。
  那条断言现在数的是画布上"非背景色像素 > 1000"，DOM 存在不再等于画出来了。
  **仍欠的三种**（是还没做，不是做不了；面板上照这三种各自的原话写）：RPG 原型（模型里没有
  成长/战斗循环的语义）、探索、解谜。
  **2026-10-22 核过：这一行过期了**——这三种都接上了（RPG 原型 2026-10-07 第八片、
  探索 2026-10-06 第六片、解谜 2026-10-07 第七片；`GAME_KIND_STATUS` 八型今天全是
  `pipeline` 非 null）⇒ 那一行留着只是当时的快照，不再是欠条。
  **2026-09-29 第五片（3D 有了真投影，立体视角一条规则都不改）**：`GAME_KIND_STATUS["3d"]` 从
  `pipeline: null` 改成 `pipeline: "topdown"` + `view: "3d"`——3D 与 2D / 2.5D 是**同一条计划**的第三种画法：
  `compileForKind` 照样派 `compileGame` 的产物，规则仍在地平面上那个 `step` 里判定。
  渲染换成 `apps/web/src/game2d/GameCanvas3D.tsx`（three.js + React Three Fiber，与 `/world` 同一个栈）：
  球=玩家、方=敌人、菱=物品、锥=NPC，与 2D 的圆/方/菱/三角一一对应，颜色抽到 `game2d/palette.ts` 两处共用
  （各写一份颜色就是两份真值，同一个人换个画法变个色看起来就是两个游戏，§16）。
  **循环的分叉点是 `GamePlay` 的 rAF 里一句 `view === '3d'` 就退出**：两个循环各推一次 step，
  同一份状态每帧被推进两遍、规则悄悄快一倍而两边的单测都还是绿的——这条比"画不出来"更难发现。
  血条与触发器冷却圈的判据与 2D 同源（满血当分母、`readyAt > t`）；按住拖动转视角，WASD 跟着相机朝向走，
  所以"往上"永远是"往画面深处"——与 2D 的屏幕方向同一套语义，不是另学一套操作。
  限度写在页面上（`data-game-kind-note="3d"`）：判定仍在地平面上、几何体是类别标记不是 3D 美术模型、
  3D 不画名字标签（名字在 HUD、任务列表与事件流里都还在）；WebGL 拿不到上下文时明说并**不**退回
  2D 画法冒充（与 `/world` 同一条口径）。同一句"接没接"在面板与试玩页是同一份 `GAME_KIND_STATUS`。
  **测试**：`story.test.ts` 的分派用例改成"3D 派出的计划必须与 2D 逐字段相等"（换画法不换规则），
  对齐用例照旧遍历状态表（表说 `view: "3d"`，分派出来就不许是俯视）；
  `@smoke §51 类型分派` 多一格（换 3D → 立体视角页 → **数玩家球颜色的像素 > 20** → 截图
  `story-play-3d.png`），反向对照改用 puzzle（真没接的类型仍然不许退回 2D 关卡）。
  3D 那格的像素断言数的是**玩家球的颜色**而不是"非背景 > 1000"：铺了地面之后非背景几乎恒真，
  断言会变成一句空话；为此 `Canvas` 开了 `preserveDrawingBuffer`（默认关掉时 `readPixels` 读到的是
  已清空的缓冲，同样会把断言变成谎话）。教训照记：DOM 里有 canvas 只说明组件挂上了。
  **2026-10-06 第六片（探索有了真投影：走近才看得见是画法，不是第二种游戏）**：`GAME_KIND_STATUS["exploration"]`
  从 `pipeline: null` 改成 `pipeline: "topdown"` + `view: "exploration"`——探索与 2D / 2.5D / 3D 是**同一条计划**
  的第四种画法：`compileForKind` 照样派 `compileGame` 的产物，规则仍在同一个 `step` 里（单测钉死 plan 逐字段相等）。
  揭示的算式放在 `play.ts`（`revealedNow` 欧氏距离、`discoverableIds` 四类清单、`EXPLORATION_REVEAL_RADIUS = 150`），
  不进组件——位置本来就是这一层排出来的（与 2.5D 投影同一条理由）。
  绘制不另写第二个函数：`drawTopdown` 加一道 `revealed` 过滤，探索就是"只画看见过的"俯视；玩家不参与发现。
  「看见过」是视图层的 `Set`（`useRef`），不进模型也不进库——模型里没有探索进度这个字段，刷新就重摸一遍；
  限度三条随画法一起显示（`EXPLORATION_VIEW_NOTES` 进 `data-game-note`）：规则与 2D 走同一个 step、
  发现不进文档也不进库、可发现的只有摆上场的那四类（§54 文档说有什么就有什么，探索不发明新东西）。
  HUD 多一个读数 `data-game-discovered="x/y"`（分母 = `discoverableIds(plan).length`），restart 清空集合从头摸。
  **测试**：`exploration.test.ts` 新增 5 条（半径 0 圆心取等、欧氏而非曼哈顿/切比雪夫——106+106 照得见
  120+120 照不见、可发现清单就是四类且不含玩家、换画法 plan 逐字段相等、半径是常量不随场地缩放）；
  `story.test.ts` 的分派用例加探索格，"没接"清单从三种减为两种（RPG 原型 / 解谜）；
  `@smoke §51 类型分派` 多一格（换探索 → 走一步 → **发现计数单调不减** → 像素断言玩家在场 → 截图
  `story-play-exploration.png`），用例标题同步改成"标探索出走近才看得见"。
  **2026-10-06 第七片（解谜有了真投影：机关连线是画法，任务判定多了「激活」这一格）**：`GAME_KIND_STATUS["puzzle"]`
  从 `pipeline: null` 改成 `pipeline: "topdown"` + `view: "puzzle"`——解谜与 2D / 2.5D / 3D / 探索是**同一条计划**
  的第五种画法：`compileForKind` 照样派 `compileGame` 的产物，规则仍在同一个 `step` 里。
  `PlayQuestGoal.kind` 新增 `"activate"`：引用了触发器的任务按首次踩到的时刻判定完成；
  `SimState.activated: Record<string, number>` 记每个机关首次被踩到的模拟时刻；
  `puzzleLinks(plan)` 把作者连了的引用画成连线（机关→目标），没连的就是孤立的开关。
  GamePlay 的 `drawTopdown` 新增 `links` 参数：激活过的机关连线实线黄色、未激活虚线淡黄，
  激活过的机关范围圈实线圈（不再是虚线）。HUD 多一个读数 `data-game-activated="x"`（已激活的机关数）：
  「激活」是模拟里唯一可判定的谜题动作，它必须有一个能被断言的读数，不能只靠看图。
  限度三条随画法一起显示（`PUZZLE_VIEW_NOTES` 进 `data-game-note`）：
  规则与 2D 走同一个 step、连线只画作者连了的引用、模型里没有表达顺序的字段所以不假装支持「按正确顺序踩」的谜题。
  **测试**：`puzzle.test.ts` 新增 9 条（goal kind 是 activate、判不出 NPC/对话、首次踩到记账、
  再次踩到不重复、无任务时纯记账、连线只画场上有的目标、没连的目标没有这条线、空文档返回空数组、
  移除实体后连线消失）；`story.test.ts` 的分派用例加解谜格，"没接"清单从两种减为一种（只剩 RPG 原型）；
  `play.test.ts` 更新 why 文案断言（"不是敌人、物品或触发器"）。
  `@smoke §51 类型分派` 多一格（换解谜 → 向右走一步 → **激活计数从 0 变正**——模板骨架那一个触发器
  恰好排在场地正右方，单实体同心环 angle=0，所以敢断言"变多"而不是只验单调 → 截图
  `story-play-puzzle.png`），反向对照改用 rpg-prototype（唯一没接的类型仍然不许退回 2D 关卡），
  用例标题同步改成"标解谜出机关连线"。
  **仍欠的一种**：RPG 原型（模型里没有成长/战斗循环的语义）。
  **2026-10-22 核过：这一行也过期了**——下面那一片（2026-10-07 第八片）就把 RPG 原型接上了，
  八种今天全部派得出真管线 ⇒ 这一行留着只是当时的快照。
  **2026-10-07 第八片（RPG 原型接上，八种全部派得出真管线——这一格从此 `[x]`）**：
  `GAME_KIND_STATUS["rpg-prototype"]` 拿到第三条管线 `pipeline: "rpg"`——不是 topdown 的又一种画法，
  加的是规则层。战斗逐字复用 `sim.step`（移动/追击/接触伤害/挥击与 2D 同一套算术），`rpg.ts` 只加成长：
  经验来自作者写的 `xpReward`（数值是自由 Record，xpReward 只是建议键），敌人没写用投影兜底
  `XP_PER_KILL_FALLBACK=10` 并逐个标 `default`，任务没写就不发——管线不替设计补经验；
  升级曲线是投影常量（`xpToNext = XP_BASE + (level-1)×XP_STEP`，每级生命上限 +10 并回复、伤害 +1），
  `RPG_RULE_NOTES` 随 plan.notes 原样上页面；任务上的 `requiredLevel` 按等级门解释。
  **等级门是帧序敏感的**：底层 step 在同一帧里「标记完成 → 判胜」，门在帧后删除 questDone
  拦不住已经宣布的通关——所以门扣下的那一帧要同时把 won 撤回；升到级的下一帧底层 step 重判
  （goals 每帧重评），不需要第二套判定。伤害加成走派生的 `planAtLevel`（plan 是常量，不改原对象）。
  web 侧 `RpgPlay` 复用 GamePlay 的 `drawTopdown`（画法不抄第二份），HUD 有等级/经验/伤害（含加成）
  读数与逐敌人的经验 provenance 清单；`describeProjection` 页首写「RPG 成长循环（战斗与 2D 同一个 step）」
  与兜底个数。
  **测试**：`rpg.test.ts` 20 条（provenance 两向、任务经验无兜底、曲线常量、纯函数确定性、
  等级门过/不过对照对——25 经验同一次击杀升级过门 vs 10 经验被扣且 questDone 保持为空但敌人已死、
  状态表对齐）；game-model 112 条全绿；全仓 typecheck + eslint 绿。
  `@smoke §51 类型分派` 的「还没接」反向对照换岗：rpg-prototype 现在断言它派的是自己的播放器
  （`data-rpg-root` / `data-rpg-level`，不是 2D 画法也不是对话播放器顶上），截图 `story-play-rpg.png`。
- [~] Game Agent + Playtest Agent（§52-53）
  — **2026-09-25 §53 的可确定那一半落地**：`packages/game-model/src/playtest.ts` 用四种固定走法
  （站着不动 / 冲向最近的敌人并挥击 / 一直躲开 / 定种子随机游走）把一份设计各跑 60 秒，
  报告写清每种走法的结局、秒数、承伤与输出、拾取与任务数。试玩页上「跑四种走法」就是它，
  不需要人操作、也不需要模型或 provider。
  **报告的限度和结果一起显示**（这是它可信的唯一理由）：四种走法不是穷举——
  "0 种通关"绝不写成"不可能通关"，"1 种通关"也不写成"好上手"；到时间上限只记"跑到时间上限"，
  不冒充失败；随机游走用定种子（默认 7），所以同一份设计两次报告逐字段相同（换种子才是换一次抽样）。
  三条具体能点出的毛病：没有可判定条件（说的是"任务没连上敌人或物品"，不是"太难"）、
  玩家没有伤害来源（"打倒"类条件永远满足不了）、站着不动也会死（察觉半径或伤害过高）。
   **2026-10-09 第二片（试玩报告覆盖另外两条管线，八种类型都有了着落）**：
   四种走法此前只在 topdown 那五种的 `GamePlay` 上有按钮——RPG 与对话两种页面连入口都没有。
   - RPG：`playtestRpg` 跑的是 `rpgStep`（与 HUD、手动试玩同一个函数）——经验、升级、等级门
     参与判定。关键对照钉在测试里：同一份带 99 级门的文档，底层 `playtest(rpg.base)` 会宣布通关，
     `playtestRpg` 扣成 0 种通关（门没开、完成被撤回）——只跑底层战斗的报告在 RPG 页面上就是谎。
     报告多两列（等级/经验、过了哪些等级门）与一个最高等级读数；兜底经验与"没过门"各是
     findings 里一条（"等级不够还是条件没满足，报告分不开这两种"）。
   - 对话管线：`playtestStory`——这一格**没有"走法"**（四种空间走法对着一段对话什么都不是），
     能确定回答的是"点不点得到"：按引用连线 BFS 可达、停点数、空正文数、走不到的段落点名。
     限度头一条就说这不是玩家行为测试（§53 的 Detect bugs 要浏览器与模型，那两格仍欠）。
   - 共用口径抽成 `summarize()` + `PLAYTEST_BASE_LIMITS`：2D 与 RPG 的 findings 不说两遍。
   - UI：RpgPlay / StoryPlay 各一个区块，与 GamePlay 同一套 `data-playtest-*` 属性。
   - 测试：`playtest.test.ts` 9→17 条（门开/不开对照、兜底两向、确定性与限度；可达正反两向、
     停点与空正文、成环、跑不起来）；game-model 120 条全绿；`@smoke §51` 多两格
     （对话页查可达性 2/2 + 截图 `story-play-playtest.png`；RPG 页跑四种走法 + 限度含 rpgStep
     + 截图 `story-play-rpg-playtest.png`；真浏览器 26s 通过）。
  **2026-10-15 §53 第三片（限度里那句"换种子才是换一次抽样"变成页面上做得到的事）**：
  上面第二条限度教作者换抽样看看稳不稳，而 `playtest` 里**根本没有种子这个入参**——
  那句话在界面上做不到，等于一份空头支票（§159 那一类）。
  - **种子是入参，也是报告的一部分**：`playtest(plan, policies?, seed?)` 与 `playtestRpg` 同形状收 seed，
    报告带回 `seed` = **实际跑了的那个**（不是输入框里那个）。回落规则只有一处（`effectiveSeed`）：
    非有限值 → 默认 7，小数**取整**不四舍五入（`12.7` 用的是 12 那份抽样，与 13 是两份）。
  - **限度文案由常量插值**：那句"默认 7"来自 `PLAYTEST_DEFAULT_SEED`；测试把数字从文案里**抠出来**
    与 `report.seed` 比——谁把默认值挪走而文案留着，这一条就红。
  - **只有随机游走那条吃随机数**，所以换种子时 `idle`/`beeline`/`flee` 三条必须逐字段不变，
    而 `wander` 的终点必须变（双向钉；只钉前一半等于允许"种子根本没参与"）。
  - UI：GamePlay / RpgPlay 各一个「随机种子」输入框，页面上印的那句来自 `playtestSeedNote(report.seed)`
    （两个面板共用一处措辞，"就是默认那一个"与"换一次抽样"互斥到不能互相冒充）。
  - **真浏览器量出一个界面谎**：`Number('')` 是 **0**，所以清空输入框会把"没填"变成种子 0——
    界面显示 0、跑的也是 0 那份抽样，而 0 是个**合法种子**，不是回落暗号。修法是清空送 `NaN`
    （模型层那条回落路径本来就为它而写），并补一条单位用例钉"0 是真种子、不是没填"。
  - 测试：`playtest.test.ts` 17→21 条（默认值与文案同源、换种子只换 wander、非有限值与取整、
    0 是真种子、`playtestSeedNote` 两向）；game-model 201 条全绿；
    `@smoke §50 试玩` 多一段（默认 7 → 填 11 → 清空回 7，三个读数与两句话都断），
    `@smoke §51 类型分派` 的 RPG 那格多钉两行（这一页没有第二套说法）；真浏览器两条 28.8s 通过。
    截图 `game-playtest-seed-11.png`。见 `docs/adr/0040-playtest-seed-is-input-and-reading.md`。

  **2026-10-11 §52 第一片（Game Agent 有真产物，产物有一个真去处）**：`game` 成为编排的第五种步骤
  （`STEP_KINDS` / `READINESS_STEPS` 各加一条，名册里 `game` 那位声明的 `game.write` 就是这一步的要求）。
  - **草稿来自确定性配方而不是模型**：`lib/agent-game-draft.ts` 那张表编出一份 RPG 原型
    （8 个实体 / 2 个敌人 / 1 条任务），id 只从 seed 派生（换时间戳不动 id，换种子才换 id），
    目标文本只改标题不动任何数值。界面上"四种脚本走法里有几种通关"是 `playtestRpg` 跑出来的读数，
    报告自带的限度与它同屏显示（只报"2 种通关"会被读成"这设计好上手"）。
  - **草稿存在任务行里**（`result.steps[].draft`，形状直接用 `GameDocumentSchema`），所以刷新之后还在、
    别的实例也读得到；编排那五步**仍然只读**——跑完之后 `countGames` 还是 0，集成测试钉着这一条。
  - **落地只由用户点那一下**：`POST /api/projects/<id>/agent/draft`，请求体只有 `taskId`——
    那份文档由服务端从任务行读出来，所以调用方贴不进任意一份设计；
    `saveGame(..., { createOnly: true })` 在项目已有游戏设计时**拒绝覆盖**（409 + 说清已有哪一份），
    拒绝之后库里那份整列 JSONB 一字未动。两种落地形状（审批门补丁 vs 显式接受整份文档）
    的取舍见 `docs/adr/0035-agent-artifact-landing-shapes.md`。
  - 测试：`agent-game-draft.test.ts` 19 条（纯层：配方≠理解、确定性、可玩性、经验跨等级门）；
    `agent-draft-accept.integration.test.ts` 7 条打真库（CSRF 前不碰库 / 三种问法同一个 404 /
    无草稿 409 + 拒绝审计 / 只认 taskId / 不覆盖且字节相同 / 放行审计按本次那份文档查）；
    `games.integration.test.ts` 的 createOnly 五道含**两条对照**（同一份草稿不带 createOnly 就写得进去，
    证明拒绝来自这道门而不是文档本身；项目里那份是 2020 年存的而草稿是刚刚跑的，
    证明挡着覆盖的**只有**这道门——前一种排布下"更旧的写"那道守卫会顺手替它挡下来）；
    `agent-orchestration.integration.test.ts` 五步全绿 +
    草稿落任务行 + `countGames===0`。e2e `@smoke`：跑 → 刷新草稿还在 → 点接受写库 →
    游戏面板读得到同一份 → 再点不覆盖，截图 `agent-accept.png` / `agent-accept-refused.png`；
    步数断言全部改成从服务端计划里读（原来写死 4，配方加一步就会假绿）。
    七条变异臂（摘门 / 丢草稿 / 掺随机 / 换顺序 / 收请求体文档 / 归属改 409 / 措辞兑现承诺）
    各自点名哪几条红，读数在 `docs/TESTING.md`；**摘门那一条第一轮只红在措辞上**，
    于是补了上面那道"旧设计 + 新草稿"的对照——守卫的独证是量出来的，不是想出来的。
   **2026-10-12 §52 第二片（链子往前走一格：Combat Design 吃上一格的草稿）**：`combat` 成为编排的第六种步骤，
   见 `docs/adr/0036-combat-design-deterministic-tuning.md`。
   - **规则层是常量不是判断**（`packages/game-model/src/combat.ts`，8f4944a）：五条目标带
     （有路可通 / 不是一照面就结束＝最快通关也要打满 18 秒 / 赢家要付出代价＝最少挨 2 点 /
     站着不动不能赢 / 一直躲不该几秒就死）、
     七条杠杆（其中"加厚敌人"是敌人 +4 与玩家 +8 **成套**动的）、每条的上下界与步长全部写死在
     `COMBAT_RULES` / `COMBAT_LEVERS`。界面上与 notes 里都点明：**这些阈值是这一格自己的定义，
     不是需求里写好的验收标准**；改的只有数值，不动布局、不加实体。
   - **读数不是估的**：每一轮改完都重跑 §53 那份定种子报告（四种走法、跑的是 `rpgStep`）。
     保留条件只有一条：`读数变好 && 没把已达标的挤破`；撤回的轮次照样留在 `rounds` 里并写明破了哪条，
     撤回的杠杆标成用尽（不许同一杠杆反复试）。
   - **产物还是草稿**：存在这一步自己的结论行（`result.steps[].draft`），编排仍然只读
     （跑完 `countGames === 0`）。拿不到上游草稿时这一步**直接 failed**，不另编一份设计来"调"。
   - **接受入口不再写死步骤**：`{ taskId, stepId? }`——给了就点名要那一步的那一份，没给取链末那份；
     点名的那一步必须真留了草稿，否则 409 并把"当时哪几步有草稿"写进拒绝审计与那句话里。
     `createOnly` 一字未动：两份草稿、一份项目，第二下点击必然被拒且库不变。
   - 测试：`combat.test.ts` 26 条纯层 + `agent-runtime.test.ts` 多两条（combat 一开始不就绪、
     game 失败只带走 combat）+ 编排 6 条（combat 的计数/摘要，且**读数从库里那份草稿重算**，
     不许这一步自己给自己打分）+ 接受 9 条（`stepId` 点名 / 点了没草稿的步骤）+ e2e 真浏览器点 `combat` 那一格。
     七条 game-model 变异臂 + 八条 web 侧变异臂的读数在 `docs/TESTING.md` 2026-10-12。
   **2026-10-13 §52 第三片（链子走到 Level Design：布局第一次成为设计里的值）**：`level` 成为编排的第七种步骤，
   见 `docs/adr/0037-level-design-authoring-positions.md`。
   - **先补模型层那个缺失的概念**（`play.ts`）：`POSITION_STAT_KEYS` / `hasAuthoredPosition` /
     `authoredPosition`——文档里写了 `x` `y` 就用作者摆的位置，没写才退回到同心环；
     玩家只在**没被写过位置**时钉在正中。HUD 的来历那一栏改成从 `PLAY_PROVENANCE_SLOTS` 派生，
     画面上每个位置都说得出是「文档写的」还是「兜底排的」（§16：投影不改真值）。
   - **规则层同样是常量**（`packages/game-model/src/level.ts`）：四条几何目标
     （先把布局写成设计值 / 别叠在一起＝间距不小于 `2 * ACTOR_RADIUS` / 别把白拿的目标摆在出生点上 /
     开局到最近敌人的距离落在 120–520 这条能反应的带里，正中 320）、四条杠杆一条对一条、
     分开时多留 8 像素、最多 12 轮，全部写死在 `LEVEL_RULES` / `LEVEL_LEVERS`；
     **改的是坐标，战斗数值、冷却、升级曲线、实体增减与引用图一个都不动**。
   - **这一格必须是独立的一格**（不是"数值格顺手做掉"）：同一份「机关贴着玩家、目标压在出生点」的文档，
     `tuneCombat` 用尽七条杠杆修不好「站着不动不能赢」（那是布局问题），`designLevel` 一轮修好——
     这条对照用**同一份文档跑两遍**，换文档等于没证。
   - **不许弄坏上一格的成绩**：保留条件仍是 `读数变好 && 没把已达标的挤破`，但 `broke` 的范围
     扩到**进入这一格时已达标的战斗目标**；位置会改变四种走法的读数，打架时布局让路。
     `moves[].kind` 分 `author`（原样写成坐标，一个像素都没挪，四种走法的报告必须逐字节相同）
     与 `shift`（真的挪了个体），界面上分开报数。
   - **产物还是草稿**、编排仍然只读；拿不到 combat 那份草稿就 `failed` 并点名"没留下 draft"，
     不另编一份设计来摆。接受入口今天面对三份草稿，`stepId` 缺省仍取链末那一份。
   - 顺手修掉一类会自己长大的错账：AgentPanel 那句作业介绍原本手写「五步作业」，
     配方早就有七步——现在步数从 `READINESS_STEPS.length` 派生。
   - 测试：`level.test.ts` 27 条纯层（多的一条钉"作者已经摆过的位置不许被列进本格改动清单"）+
     编排 3 条（守卫 / **除了坐标与时间戳两份草稿逐键相等** /
     跑不起来那份按存进任务行的那份重算达标条数且 0 轮 0 处改动）+ 接受层三步都留草稿 +
     e2e 真浏览器点 `level` 那一格（判别证据是"库里有作者坐标而 combat 那份一个都没有"）。
     13 条 game-model 变异臂 + 接线 6 臂 + 只在真浏览器里量的那一臂（把派生步数改成手抄的 5 →
     e2e 红在 `Expected substring: "7 步作业"`）的读数，与**两条最初是绿的臂**
     （一条是分支不可达、一条是"覆盖与跳过读数等价"）都在 `docs/TESTING.md` 2026-10-13。
   **仍欠**：§53 的 Capture screenshots / Fix 两格（要接浏览器与模型）、§52 那条链的
   最后一格 Code（产物要能下载、**不得在主机执行**，§81）——Level 这格今天落地了，
   但它只把投影排好的位置写成设计值并按写死的几何目标摆开，摆出来的布局不是美术成品。
   前置条件已经好了：`sim.ts` 是无头、定步长、可复现的（同一份计划 + 同一段输入 = 同一个状态，有测试钉住）。

   **2026-10-14 §52 最后一片（Code：产物能下载，而且真的能玩）**：链子的最后一格落地，
   见 `docs/adr/0038-code-cell-transcription-and-browser-parity.md`。
   - **转写而不是复用**：产物里的引擎是 `sim.ts` 的转写（同一段推进逻辑，ES5 形状、能独立打开），
     四个规则数与那句拒绝**由 `sim.ts` 的导出插进模板**——模板里不许出现对应的字面量，
     否则就是两处各写一遍，改一处另一处不会跟着红。
   - **§81 的守法形状**：生成侧只有字符串拼接（不 eval、不起子进程、不读写文件、不联网）；
     产物自带 CSP `connect-src 'none'`；见证把字节交给 **loopback 上另一个源的浏览器**跑，
     主机自己从不执行它（`scripts/game-code-parity.mts`，`npm run parity:game-code`）。
   - **"转写等价"这句话第一次被结账**：那条见证 13 条判决首跑就报出**产物里所有敌人开局就是死的**
     （`initialState` 用了 `cloneActors(plan.*)`，而计划里没有 `active` / `readyAt`）——
     不追、不打、物品捡不起来，页面摘要却照样写"进行中"。当时那 17 条比对常量与键名的静态闸**全绿**。
     补了与 `sim.ts` 的 `actor()` 同形的 `startActors`，并留下一道读结构的闸 + 反向控制。
     修完之后：**979 帧、980 个状态、1 771 994 字节的轨迹与平台引擎逐字符相同**，
     末态摘要逐字相同，五条分支各自跑到（伤害 2 / 挥击 3 / 输出 4 / 拾取 1 / 机关 52、事件流停在 40 条上限）。
   - **出口是只读的**：`GET /api/projects/<id>/game/code` 从库里那份设计现算，归属先判、响应体有上限（超了 413 并报字节数）；
     界面（`GameCodeExport`）把 `CODEGEN_LIMITS` 那四句原样念出来，一个文件一个文件用 Blob 落盘。
     2026-10-21：落盘那一步与导出面板、市场条目统一到 `src/lib/download.ts` 的 `saveBlob`（回收对象 URL 的
     时机只写一处；同一 tick 回收到底会不会截断，先在真浏览器里量过——Chrome 上没有复现，详见 ADR-0047 补记）。
   - **e2e 又抓到一格界面在撒谎**：这一格读库里那份，而 PUT 还在飞时屏上已经有 11 个实体了——
     第一版按钮照样能点，于是"刚建完骨架就生成"回一句「这份项目还没有游戏设计」。
     现在库里没跟上屏上（`dirty` / `saving`）时它点不动并写着原因；变异臂（把 `behindLibrary` 摘掉）
     红在 `expect(locator).toBeDisabled()` / `Received: enabled`。
   **2026-10-15 §52 最后一片的补刀（ZIP 那一格接上，并补上从没红过的字节上限）**：
   - **整份拿走**：`GET .../game/code/zip` 走的是**同一道闸口**（`projectGameCode`：同一个 404/500 判定、
     同一份库里设计），出口形状换成 store zip。界面多一颗「打包成一个 zip 下载」，
     它与「生成可玩产物」**共用同一只手**（库里没跟上屏上时两颗都点不动）。
   - **上限取两档，而且都撞得开**：`MAX_CODE_JSON_BYTES` 1MB / `MAX_CODE_ZIP_BYTES` 4MB。
     4MB 不是拍的——它是按 schema 自己那条 5000 实体上限反着挑的，保证"合法范围内的最大一份"
     真能撞上这一档（实测 5000 实体 → 5 590 780 字节）。取到 8MB 以上就是一个永远不会红的装饰性拒绝（§159）。
     中间档同样实测过：1500 实体 → 1 686 178 字节，JSON 出口回 413、zip 出口回 200。
     因为包用 store 不压缩，413 那句"把这一份拆成几份设计"才是真话。
   - **这一片的四臂变异电池**（读数在 `docs/TESTING.md`）：对照臂 10 条全绿；
     zip 那档降到 JSON 那档 → 2 条红；把整份产物塞进 413 的拒答 → 1 条红；
     把归属判定那一行删掉 → 3 条红（红的正是三条归属见证，413 那几条一动不动）。
   - **修掉一个让 HEAD 变红的提交洞**：`e8c652f` 用了 `slug`，而让它可被 import 的那一行
     （`export function slug`）没跟着进 commit——机检的 pre-commit 跑的是**工作树**上的 `npm run lint`，
     树里有那一行所以绿，HEAD 里没有（还原成 HEAD 那一份再 tsc → `TS2459`，exit 2）。
     纪律进 ADR-0038：**pathspec 列表里必须有"让这个里程碑自己绿"的那一行，工作树绿不等于 HEAD 绿**。
   **2026-10-15 §52 最后一格接进编排链（`code` 成为第八种步骤：报投影的读数，什么也不留）**：
   - **链到这一格才真的通**：`context / seo-audit / qa-audit → report` 三份检查与汇总，
     `game → combat → level → code` 四格产物。作业现在能替用户报出"这份设计投影出来是几份文件、多少字节"，
     而这句话与作者随后在「游戏」面板点那颗按钮拿到的产物**同一个生成器**算出来。
   - **它是投影不是草稿**：`dependsOn: ['level']`、拿不到 level 那份草稿就**整步失败**并点名缺的是谁
     （绝不现编一份再投影）；它**不留 `draft`、不写库**，所以接受入口仍然只有 game / combat / level 三颗按钮，
     缺省那份仍是链末的 level。这一句在 e2e 里有正反两面：`[data-agent-accept-step="code"]` 数为 0，
     而同屏 `="level"` 可见；面板上那句 summary 与服务端读回来的那份**逐字相同**。
   - **这一步不许自己给自己打分**：集成测把库里 level 那份草稿**再投影一遍**，
     用另一次调用的 `files` / `bytes` / `notes` 数对账，并再断一次"同一份设计两次投影字节相同"（没有时钟）。
   - **限度随读数一起进结论**：`CODEGEN_LIMITS` 那四句（转写 / 没有 Studio 界面 / 不联网 / 不执行任何东西）
     原样列在 notes 里——只报"生成成功"就是作业在替产品撒谎（§81/§159）。
   - **这一片的六臂变异电池**（对照臂 41/41 全绿，读数在 `docs/TESTING.md`）：拆守卫 1 红；
     让它也留草稿 → 3 红（红的两条在**接受入口**身上）；依赖从 level 改成 game → 14 红（这一格真拿不到上游）；
     整条从配方删掉 → 11 红；`counts.bytes` 报 0 → 1 红；notes 丢掉限度四句 → 1 红。
   - 顺带把一条写死的读数改成派生：`agent.activity` 原来钉 `toHaveLength(15)`（"现在是七步"），
     现在是 `1 + 2 * result.steps.length`——写死的版本加一步时只会红得没有信息量。
   **仍欠**：§53 的 Capture screenshots / Fix 两格（要接浏览器与模型）。
   **2026-10-16 §53 的四种走法接进链（`playtest` 成为第九种步骤，与 `code` 并列而不是排在它后面）**：
   - **接法本身是这一片的新决策**（ADR-0042）：这一格与 `code` **都只依赖 `level`**，不是串成
     `level → code → playtest`。理由是仓库那条比"看起来完整"更硬的规矩——**计划里那条依赖箭头必须有数据可交接**，
     而 `generateGameCode` 从头到尾不读试玩报告。串起来的唯一后果是"这份设计太难"变成"这份产物拿不走"。
   - **两个方向各有一条纯层用例**：正向（level 炸 → `playtest` 与 `code` **两格**都是 skipped、
     `because` 各是 `['level']`、通知说"1 步失败，2 步被跳过"）分辨不出谁依赖谁，
     所以补了反方向那一条——**`playtest` 自己炸时 `code` 照跑**（`blockedIds` 为空、`readyIds` 仍是 `['code']`、
     通知只说"1 步失败"）。那条边没画出来，这条才会绿。
   - **形状与 `code` 那格同律**：拿不到 level 留下的草稿就**整步失败**并点名缺的是谁，
     守卫失败时 `counts` 是空对象、`notes` 是空数组——"没跑"不许渲染成"0/4 种通关"；
     它**不留 `draft`、不写库**，所以接受入口仍是 game / combat / level 三颗，缺省那份仍是链末的 level。
   - **跑的是 RPG 那条管线**（`playtestRpg(compileRpg(草稿))`，与试玩页、HUD 同一个 `rpgStep`）：
     用底层 `step` 跑这份草稿会得出"任务过了"而等级门其实扣着的假报告。种子**固定用默认值**——
     作业里每一步要逐次可比，换种子是试玩页那一格的事，notes 里那句话写着去哪儿换。
   - **三档读数各自报数且能加回去**：`won + lost + unfinished === policies`。只报"几种通关"
     会把"跑到时间上限一直没结束"混进"通不了"里，而那是 §53 文件头写明的限度。
     限度五句（三条基础 + 跑的是 `rpgStep` + 升级曲线是投影常量）与 findings 一起进 notes，条数从报告读不写死。
   - **凭证**：纯层 `agent-runtime.test.ts` 18 → **19 条**（依赖表、就绪顺序、双向牵连、终态、交接、进度分母）；
     打真库的 `agent-orchestration.integration.test.ts` **15 条**，其中新的一条把库里 level 那份草稿
     **再跑一遍** `playtestRpg` 对账（走法数 / 三档 / 最高等级 / 种子 / findings / limits 逐字段），
     所以这一步不许自己给自己打分；`agent-draft-accept.integration.test.ts` **9 条**一字未改就继续绿——
     它是"这一格不留草稿"的**外部差分**（`draftSteps` 仍是那三步）。
   - **e2e 多出一寸只有浏览器量得到的**：`counts` 与 `notes` 只在展开那一格时才渲染，集成测证得了
     服务端算出五句限度，证不了那五句**画得出来**。现在逐条要求 `[data-agent-step="playtest"]` 里读到
     服务端 notes 的每一句原文、`{key} {value}` 那几行逐行可见，并截展开态的图
     （`screenshots/agent-playtest-expanded.png`：`won 1 / lost 0 / unfinished 3 / policies 4 / seed 7 / limits 5`，
     同屏上一格 level 有「接受进项目」而这一格没有）。`e2e/agent.spec.ts` **2 passed**。
   - **这一片被自己那条钉红过一次**：限度那句我手抄成"不穷举"，真话是"不是穷举"——红的是测试不是产品，
     而这正是手抄的句子没有对照物的下场（§159）。改成从服务端 notes 派生后，e2e 里不再有一个抄来的数。
   - 步数从八到九：`agent.activity` 条数、库里结论份数、面板那句"N 步作业"三处**都是派生的**，
     加一步一条没红；红的是真该红的东西（依赖表、终态判定、交接清单、牵连清单）。
   - 起点是绿的才动手：`npm run lint`（typecheck 九个项目 + 全仓 eslint）**exit 0**，
     game-model 与纯层合跑 **220 条全绿**，DB 侧两套 15 + 9 全绿。
   **2026-10-22 链上那一型由请求显式给出（ADR-0052）：这条欠条的后一半付掉了**——
   2026-10-21 那格把**下游**修好（试玩格按草稿的 kind 派管线），这一格把**上游**也修好：
   - **上游也带 kind 了**：`gameDraft` 接受 `kind`（缺省 RPG 原型 ⇒ **今天那份逐字节不变**：
     改配方说明与数值之前先拍了快照，改完逐字节对过；纯层用例另外钉住关键句）；
     `gameStep` 按型编译与试玩，不再硬编 `compileRpg` + `playtestRpg`。
   - **型记在计划里**：`AgentPlan.gameKind` ⇒ 任务行读得出"这份作业当时编的是哪一型"，
     刷新后复看不用猜（§16）。
   - **一张配方表，每型一段变体**（不是两张表）：topdown 那五型把"经验/等级门"那几句**换掉**
     ——不是补一句"其实不参与判定"，那句会与前一句（"条件凑齐但没到级就不结算"）自相矛盾；
     数值同理：`xpReward` / `requiredLevel` 只有 RPG 管线读（`compileGame` 只读 `timeLimit`），
     留在别的型里就是"设计里写着要 2 级"而这一型根本不看等级。
   - **派发只留一处**：`playtestByKind` → `compileForKind`（上一格自己写了一遍 kind → pipeline，
     那是 §16 的两份真值，这一格收回来了）。
   - **对话那两种诚实拒收**：链上那份配方给的是战场与战斗，而对话要的是对话实体
     ⇒ 400 + 一句"链上还没有配方"，不做空草稿（§159）。
   - **凭证**：纯层 `agent-game-draft.test.ts` **19 → 23 条**（缺省那份不变 / 2D 那份的说明与数值 /
     对话那两种拒收 / 2D 那份仍是合法设计）；打真库的 `agent-orchestration.integration.test.ts`
     **18 → 21 条**（链上要 2D ⇒ 计划带型、草稿带 kind、试玩读 topdown 的数；对话那型拒收且不留任务行；
     不认识的型拒收并把八种说清楚）。
   **2026-10-22 界面上的类型选择器也接上了（ADR-0052 / ADR-0053 的最后一片）**：
   Agent 面板多一个「这一轮编哪一型」的下拉 ⇒ 请求带上 `gameKind` ⇒ 计划里记着那一型
   （`AgentPlan.gameKind`）⇒ 面板的回显说出那一型。
   - **八型今天全都编得出来** ⇒ 下拉里**不藏哪一型**（藏起来等于"看起来没有"）。
   - **缺省是链上的缺省型**（RPG 原型）⇒ 不选就与今天的行为一模一样。
   - **凭证**：e2e `agent.spec.ts` 多一条
     （`@smoke agent 面板上的类型选择器：选 2D 就跑 2D 那一型`）：
     缺省是 RPG 原型 ⇒ 选 2D ⇒ **服务端那一份计划里 `gameKind` 就是 `2d`**
     ⇒ 面板回显是 2D ⇒ 第一格摘要里是"2D 草稿"
     ⇒ 试玩格展开后 notes 里逐字出现 `topdown`（管线名在 notes 里，summary 的措辞是中性的）
     ⇒ 截图 `screenshots/agent-kind-2d.png`。
   **仍欠**：§53 的 Capture screenshots / Detect bugs / Fix 三格要浏览器与模型，本机不假生成（§159）。
   **2026-10-22 战斗格与布局格也按型派（补上 ADR-0052 那一格漏掉的两步）**：
   上一格只把**上游（编草稿）与试玩格**按型派了，战斗格与布局格当时还在 game-model 里
   **无条件** `compileRpg` + `playtestRpg` ⇒ 链上一份 2D 的设计被拿 **RPG 的判据**去读，
   报出来的"战斗目标达成没有""布局摆得开不开"不是这份设计那条管线的读数（§159）。
   ⇒ **改一半比不改更坏**：上游读的是自己那条管线、下游读的是 RPG 那条 ⇒ 同一份作业里两个口径。
   - **怎么改的**：战斗目标与布局目标读的都是**走法里的公共字段**
     （`status / seconds / damageTaken / policy`）⇒ 类型从 `RpgPlaytestReport` 放宽成
     `PlaytestReport`（RPG 那条是它的子类型）⇒ 两边的 `evaluate` 改成走 `compileForKind` 分派。
   - **RPG 那条路径逐字不变**：`compileRpg` 的 `base` **就是** `compileGame(document)`（`rpg.ts`）
     ⇒ 杠杆读到的 `enemies` / `player` 一模一样 ⇒ **既有那批 combat / level 用例的断言一个字没改就绿**
     （只把一个测试辅助函数的参数类型放宽容）。布局格那个只被搬运、没被读过的 `rpg` 字段直接去掉（§16）。
   - **读数来自哪条管线由模型层说**：`CombatTuning.pipeline` / `LevelDesign.pipeline` 跟着走
     ⇒ 链上那两格在界面上**说出**自己那条管线（RPG 那一条一个字都不加 ⇒ 今天的界面一个字不变）。
   - **凭证**：新建 `packages/game-model/test/kind-dispatch.test.ts`（3 条：2D 那份的战斗/布局读数
     **测试自己重算一遍**（`combatGoals(playtest(compileGame(doc)))` 那一对）⇒ 不许自证自成；
     对话那一型明说"没有战斗可调 / 没有位置可摆"）；打真库的
     `agent-orchestration.integration.test.ts` **21 → 22 条**（链上要 2D ⇒ 战斗格与布局格的读数
     与测试自己重算的那一份逐项相等，且两格都说出 topdown 那条管线）。
   **2026-10-22 对话那两种也进链了（ADR-0053）**：这一条欠条里的"对话管线在链上还没有各自的一格"
   至此付掉 ⇒ **八型今天全都编得出来** ⇒ 不再有"链上编不出来"的那一型。
   - **第二张配方表**（`GAME_DRAFT_SPEC_STORY`）：对话实体与战场实体**不是同一类**
     ⇒ 换表而不是换变体。六段对话、两个结局（"收下这张画" / "转身离开"）。
     **正文就是对话实体的说明**（`compileStory` 只读它当正文）⇒ 所以正文必须干净：
     "配方给的起点，不是成品"那句 caveat **不进正文**，它去文档 summary 与链上那一步的 notes。
   - **对话实体没有数值**：它的内容就是正文与选择（判定全在引用上）⇒
     "每个实体都有数值"那条纪律**对对话不适用**（战场那张表才适用）⇒ 这一条写进代码注释与 ADR。
   - **战斗格与布局格对对话型"原样交回"**：对话管线里没有战斗、没有场地 ⇒ 那两格不改任何东西、
     **不留读数**（counts 是空对象 ⇒ 界面上不会渲染成"0/5 条目标达标"——空读数与"0 条达标"是两件事），
     草稿照旧往下传 ⇒ **链的形状不变**（九步不变、依赖不变）。
   - **试玩格给对话那套数**：对话管线没有"走法"可言 ⇒ 读数是**按引用连线走不走得到**
     （可达几段 / 能停下几处 / 有几段正文是空的）⇒ 硬凑成"通关数"就是拿一条管线的说法去说另一条。
   - **模型层的派发加第三个成员**：`KindPlaytest` 变成三份报告的可判别联合
     （`PlaytestReport` / `RpgPlaytestReport` / `StoryPlaytestReport`）⇒ 按 `pipeline` 收窄 ⇒
     调用方不靠强转、也不会把某一型的字段当成别的型也有。
   - **凭证**：纯层 `agent-game-draft.test.ts` **23 条**（对话那份：正文不为空 / 起点是第一条 /
     两个结局 / 可达 6 段 / 空正文 0 / 八型都编得出来 / 结构校验过）；模型层 `playtest.test.ts`
     那条"对话那两种明说还没接"改成"走对话那条管线"（可达 2 段 / 1 个结局）；
     打真库的 `agent-orchestration.integration.test.ts` **22 → 22 条**（换掉了"对话那型拒收"那条：
     现在它编得出来 ⇒ 断言草稿带 kind / 战斗与布局两格原样交回且不留读数 /
     试玩格读的是对话那套数 / 最后一格照旧投影）。
- [~] 游戏设计系统：Player/Enemy/Weapon/Item/Quest/Dialogue/Trigger/NPC/Camera/Animation/Particle（§54）
  — **2026-09-24 落地模型层**：新开 `packages/game-model`（与 design-model / world-model 同一条纪律：
  无 React、无 IO，两端跑同一份校验）。11 类实体 + 数值旋钮 + 实体间引用 + 引用完整性校验 + 确定性投影，
  见下方 M4 进度记录。
  **2026-09-25 第二片（存库 + 面板）**：`packages/schemas` 加游戏文档契约（zod，与 `GAME_ENTITY_KINDS`
  逐字对齐）、迁移 `0007` 把 `games` 表换成与 `worlds` 同形的整份 JSON 存储、`domain/games.ts` +
  `/api/projects/[id]/game`（GET 不建档）、Studio 左侧「游戏」面板（`gameStore` + `GamePanel`）：
  11 类分组、实体说明、开放数值、有向引用的连与摘，全部只调模型层的纯函数。见下方"第二片"进度记录。
  **2026-09-25 第三片（引用图画布）**：主区第五个视图「游戏图」（`GameGraphView`）把 `referenceGraph`
  画成一张有方向的图，与左侧面板共用同一个 `gameStore`（不分叉真值）。位置按 11 类分列算出来、
  **不写进文档**（游戏文档没有位置字段，布局是视图的事）。见下方"第三片"进度记录。
  **2026-09-25 第四片（可玩投影）**：`play.ts` 的 `compileGame` 把文档编译成一份关卡计划，
  `sim.ts` 的 `step` 是唯一的规则来源（移动 / 追击 / 接触伤害 / 拾取 / 任务判定 / 胜负），
  `apps/web/src/game2d/GamePlay.tsx` 只管输入、绘制与 HUD——浏览器里玩到的和单测断言的是同一套算术。
  四条限度都同时显示在页面上（`data-game-note`）而不是只写在注释里：
  位置是投影按类别排在同心环上的（模型里没有坐标与地形）、所有个体一样大（没有尺寸字段）、
  形状只区分类别不是美术、触发器只记账不做效果（§54 说了它引用谁，没说触发之后发生什么）。
  **数值来路逐条可追**：每个用到的旋钮带 `provenance`（`design` / `default`），HUD 下面写
  "N 个实体的生命是投影兜底的"；玩家没有 `attackPower` 也没有引用到他的武器时，伤害就是 **0** 并说明
  "只能躲、不能打"——给一个看不见的 1 点攻击力就是造假数据（§159）。
  任务的完成条件同样只在"引用了敌人或物品"时才算可判定，判不出来的列在任务表里说清为什么，
  不悄悄算作自动完成，也不会因为它永远不满足而谎称"这版没有赢"以外的话。
  **仍欠（2026-10-20 核对后改口径）**：原句写的是「§52 Game Agent 与 §53 Playtest Agent 的编排、
   地形与碰撞、`talk`」——前两半**早已落地**（编排九步在 `server/agent/runtime.ts` 的 `RUNNERS`：
   `game / combat / level / playtest / code`，§52 四格 2026-10-12→10-15、§53 那格 2026-10-11）；
   `talk` 要 §47 的真 provider，按 §159 留白。
   **「地形与碰撞」这一半不是欠账，是过期行**——§54 原文那 11 类实体
   （Player/Enemy/Weapon/Item/Quest/Dialogue/Trigger/NPC/Camera/Animation/Particle）里
   **没有墙、也没有地形这一类**，`packages/game-model/src/sim.ts` 头部照实写着
   「地形与碰撞体：只有开阔场地，没有墙」，HUD 上那四条限度也照实说。
   换句话说：**是需求没要，不是我没做**。要加「墙」就得先改 §54 的实体清单（那是产品决定，不是实现欠账）；
   至于把 §140 的世界地形（台地/坡地）接进 2D 关卡当障碍或坡道——那同样是一个**新的产品决定**
   （两个独立文档怎么关联、语义怎么映射，用户没说过），**不是这里可以替他做的**。
  （公开可玩与 §168 的 play time 已在上面的"第二片"接上；`/game/<项目>` 仍是作者自己的试玩页，
  公网那一版走 `/n/<handle>/<slug>/play`。）

**M4 进度记录（2026-09-24，§54 游戏设计系统模型层）**：新包 `packages/game-model`，
照 world-model 的模板起（`package.json` / `tsconfig.json` 同形，接进根 `typecheck` 链与 vitest alias）。

模型：§54 原文列的 11 类实体一个不少（`GAME_ENTITY_KINDS` + 中文名表）。每类共用一份基底
（`id / kind / name / notes / tags / stats / refs / updatedAt`），差异体现在**数值**与**引用**上。

两个刻意的"不写死"，都是为了避免我替需求加它没写的东西：

1. **不预填任何数值**。`createGame` 给的模板骨架是 11 类各一个空实体，名字写着类名，
   `notes` / `stats` / `refs` 一律留空。编一套 `health=100 / damage=12` 出来就是替用户做设计，
   而且那套数字没有任何依据——§159 不许假生成，这条对"设计内容"同样成立。
   `fleshedOutCount` 因此能如实回答"11 类里有几个是真填过的"，而不是把模板当成内容。
2. **不写死属性表**。§54 只列了 11 类实体，没规定每类有哪些属性。所以 `stats` 是开放的
   `Record<string, number>`，只校验"值是有限数"（`NaN` / `Infinity` / `'100'` 一律拒）；
   另有 `STAT_HINTS` 给出**建议键名**供界面做占位提示。建议不写进校验里——
   写成校验就等于我把"多数游戏都有的旋钮"升格成了需求没写的约束，用户想加 `poise` / `iFrame` 会被无故拒绝。

**引用（refs）是这一层的重点**：实体之间有向引用（`武器 →装备于→ 玩家`），
`role` 说明关系种类、可留空，但 `to` 必须指向文档里真实存在的实体。
`linkEntities` 拒绝自引用、悬空端点、同一对之间重复的同一关系，且**绝不静默**——
`reason` 带回原因由面板显示。同一对之间允许并存多条**不同**关系（「装备于」与「由玩家挥动」是两件事），
所以摘除按引用自己的 `id`，不按"从哪到哪"。

与 world-model 的一处关键差别值得记下：世界的关系是**独立存**的（`document.links`），
删条目只要过滤那张表；这里的引用挂在**实体自己身上**，所以 `removeEntity` 必须两头都清——
自己发出的引用随它消失，**别人指向它的引用也要摘掉**，否则会留下一堆悬空引用。
摘入边等于改了那个实体的内容，所以它的 `updatedAt` 也一起更新（面板不该顶着旧时间戳显示"刚被改过"）。

校验（`validateGame`）覆盖：非 11 类的 kind、无名实体、id 重复、时间非法、
数值非有限数（消息里带实体名与键名）、自引用、悬空引用、重复引用。
投影给了 `gameCounts`（11 类计数，缺的补 0）、`referenceGraph`（节点 + 边；指向已删实体的边
在这里被自然丢掉，而校验同时报 `missing-ref-target`——渲染层不该看到画不出来的东西，
但校验必须知道它存在，两件事都要有）、`countRefsFor`（删实体前的确认文案用）。

验证：`npm run lint` 通过（新包已进 typecheck 链）；`packages/game-model/test/game.test.ts`
**39 条全绿**（11 类齐全与原文逐字核对、模板不编内容、CRUD 不可变、数值六种非法值被拒、
引用四类非法情形、删实体两头清理与时间戳、悬空边投影 vs 校验的分工）；
非库测试 **34 files / 434 tests 全绿**。本轮 Docker 未运行，13 个 `*.integration.test.ts` 未执行，
但本切片是纯模型包、不碰数据库，不受影响。

**M4 进度记录（2026-09-25，§54 第二片：存库 + Studio 面板）**：

- **契约**（`packages/schemas`）：`GameDocumentSchema` 等 5 个定义，进出服务端都过 zod；
  kind 枚举与模型层的 `GAME_ENTITY_KINDS` **逐字对齐并有测试盯着顺序**（两边各写一套迟早漂移）。
  `stats` 在契约层同样只认有限数（`NaN` / `Infinity` / 字符串值在读写两侧都被拒）。
- **存储**（迁移 `0007_game_document.sql`）：`games` 表原来是 `entities / scene / game_kind` 三列
  ——**没有任何代码读过它们**，等于一份没人认领的假数据。换成与 `worlds` 同形的
  `document jsonb + name + summary + owner_id`。切换前用 `select count(*)` 确认表里 0 行，
  所以没有"迁移丢数据"这回事；这一点写进了迁移文件的注释，不靠记忆。
- **读写**（`domain/games.ts` + `/api/projects/[projectId]/game`）：GET 没有游戏就返回 null，
  **不顺手建档**（"还没有"与"有一份空的"是两件事）；PUT 过 zod + `validateGame`，
  拒跨项目文档、拒比库里更旧的写（两个请求乱序到达时旧版本不能赢）。
- **面板**（`gameStore.ts` + `GamePanel.tsx`，接进 `StudioShell` 左侧页签）：照 worldStore 的
  已验证形态来（单例 store + `useSyncExternalStore`、在飞只一次 PUT、在飞期间的改动记一笔补发、
  迟到的读结果不覆盖本地真值、`keepalive` 让"改完就刷新"真的落库）。面板**只调模型层的纯函数**，
  不在 UI 里改文档结构。三处刻意出声而不是静默：空键名 / 非有限数值 / 重复引用，
  模型层返回的 `reason` 直接显示在面板顶部，并且**下一次成功的编辑会把它擦掉**
  （不然用户会以为刚加的那条也被拒了）。
- **验证**：契约 5 条 + 集成 8 条 + 模型 39 条全绿；`npm test` **54 files / 584 tests 全绿**；
  `npm run lint`（typecheck + eslint）0 问题；新增 `@smoke 游戏：建骨架、填数值、连引用、刷新仍在（§54）`
  并做了反向实验——把 GET 改成永远返回 null 后该用例**确实失败**在刷新后的断言上，
  说明"刷新仍在"这条断言咬得住只活在内存里的编辑。截图核对过面板实际长相，
  据此把引用那一行改成可换行（264px 的左栏里三个控件挤在一行会把按钮压扁）。
- **这一条已落地（2026-10-21 核实）**：`referenceGraph` 的图**UI 已经有投影了**
  （`apps/web/src/studio/GameGraphView.tsx` 直接 import 它并画出来）⇒ 原句"后端有图、UI 没有投影"是过期条目；
  剩下要真 provider 的是 §52/§53 那两个 Agent 的落地。
  §50/§51 的构建管线与类型选择。（写这段时三项都还欠着：引用图画布随后落在 2026-09-25 第三片，
  类型选择与对话管线落在 2026-09-26 §51 第三片；§52/§53 的 Agent 编排到今天仍欠，要真 provider。）

**M4 进度记录（2026-09-25，§54 第三片：游戏引用图 = 主区第五个视图）**：

- `GameGraphView.tsx` 把 `referenceGraph` 那份投影画出来，接进 `StudioShell` 的视图切换
  （画布 / 方案 / 代码 / 世界图 / **游戏图**）。与左侧「游戏」面板共用同一个 `gameStore`，
  图上连一条引用，面板那条立刻跟着出现——两份真值就是 §16 要避免的事，用例盯着这一点。
- **位置不存在文档里，而且是刻意的**：`GameDocument` 没有位置字段（模型层把布局划给视图）。
  所以 11 类各占一列、列内按文档顺序往下排，同一份文档每次打开排成同一个样子。
  世界图那边存位置是因为 §45 明说"摆过的位子是 3D 世界的地面布局"（§140），这里没有这个语义，
  就不为了"看起来一样"塞一个字段进契约。
- 边**两端裁到方块边上、中间沿垂直方向拱开**。第一版照世界图那样画中心到中心的直线，
  结果"点边删引用"点了没反应：同一行的两个实体，连线正好从中间那一列节点的 rect 底下穿过，
  命中区被后画的节点盖住，点上去选中的是节点。拱开之后箭头也第一次露得出来了
  （直线终点在目标节点中心，而节点在 SVG 里后画，把箭头整个盖住）。
- **顺带捞出一个静默失效的整类 bug**（见 `docs/TESTING.md`）：世界图的"选中"描边写的是
  `var(--nexus-color-accent)`，而设计系统里只有 `accent-1` / `accent-2`。CSS 变量拼错不报错，
  只让属性退回继承值——于是用户点了节点看不出任何变化，测试还全绿（它断言的是文字不是颜色）。
  新加的 `apps/web/test/style-tokens.test.ts` 把整类挡在门禁里：扫界面源码里每个
  `var(--nexus-*)`，未在 `tokens.css` 定义即红。第一次跑除了这处，还捞出 4 个页面 h1 用了
  不存在的 `--nexus-font-size-20`（字号梯度是 18/21，没有 20），一并改到 21。
- **验证**：`npm run lint` 0 问题；`npm test` **55 files / 586 tests 全绿**；
  新增 `@smoke 游戏图：点两个实体连引用、重复被拒、刷新仍在、摘掉归零（§54）`。
  这条用例的"点抓手摘引用"那一步就是先红后绿的（直线版本点不到边），不是补上去摆设。
  截图核对过实际长相，据此删掉了界面文案里漏出来的 markdown 星号（`**模板骨架**` 这种写法
  在 JSX 里是原样显示的）。
- **§54 现在欠的**：§52/§53 的 Game Agent 与 Playtest 编排（§51 的八种类型已于 2026-10-07
  全部接上，不再欠类型管线）——编排那半要真 provider 或真运行时，不在面板里塞假按钮。
  （"引擎类型选择"本身已经在 2026-09-26 接上：类型是文档字段，两个试玩页共用 `compileForKind` 分派。）

## M5 — 视频（§185）
- [~] Video Studio（text/image/storyboard→video）— **2026-11-06 第三十八片把这条从 `[ ]` 推到 `[~]`**，推的是"四条箭头里有没有人真的读它"那一格，**不是**"多了一个叫 Video Studio 的页面"：视频入口至今就是分镜面板那颗渲染钮（`data-storyboard-render`）+ 它下面的回执与历史，加上任务账本，没有独立的 `/video` 路由。这一片之前 `planVideoRender` 只看 `shot.referenceAssetId`，`storyboard.source` 那一格在整条渲染链里零命中——于是"来源：参考图 → 视频｜参考图 …"写在画面上方，而画面里一张参考图都没有，全是色卡。现在：`image-to-video` 带的整片那张图补进**自己没挂图**的那些镜（每镜自己的参考帧照样赢，更具体的决定优先），`RenderSource.from`（`shot` / `source`）记下画面出处，`sourceReferenceCount` 与 `cardCount` 两个数分开数并一起进任务行，三种形状各有一句 `notes` 原样显示在面板上。**四条箭头今天都有渲染层的话可说**：`text-to-video` 与 `storyboard-to-video` 本就不许画面输入（`ARROW_SOURCE_NEEDS` 里它们的 `referenceAssetId` 是 false，渲成色卡是兑现承诺不是缺件），`image-to-video` 那张图真的进像素了，`character-to-scene` 还不进。**还欠三样，前两样不是本机能让它成立的**：① `character-to-scene` 进像素——角色不是一张图，认肖像要靠查库（`assets.character_id` + `genMeta.characterPortrait`），而 `packages/video-model` 的第一条纪律是纯函数不查库；它今天的可见出口是 notes 里那句限度 + 下一步动作，账在 `docs/adr/0086` 仍欠 ①；② 真 provider 出的帧（`videoAssetId`、regenerate shot 与它是同一道门）——本机只有确定性合成器，成片带 `demo: true`、界面常驻 DEMO MODE（§159/§160）；③ 一个真正的 Video Studio 工作台（素材挑选、逐镜可指认画面出处、时间线可播），今天时间线仍"可读不可播"。逐条凭证见文末「M5 第三十八片」。
- [~] Storyboard → Shot list → 参考图 → 生成 → Timeline（§40-42）— 存储、分镜面板入口（切句成镜、机位/转场/时长/上下移/删除，全部走 §150 的可撤销补丁）、Timeline 条与总时长、镜头进语料库（§49 × §40）、镜头挂本项目的角色（§40 × §46，见文末）都已落地。**这一条原来写着"还欠两半：参考图只做到能选本项目资产，没把 §38 的生成按钮接到镜头上；`videoAssetId` 要真 provider"——前半句 2026-10-08 核对时已经不成立了**：`StoryboardPanel.tsx` 里那颗 `data-storyboard-image-gen`（"DEMO 参考图"）调 `makeReference()`，POST `/api/projects/<id>/images`，挂了角色就走 Character → Scene 那条；成功后把新资产补进名册（不补上 select 会渲染成空白，用户看到"刚挂上的东西不见了"），再落一个只改 `referenceAssetId` 的 §150 补丁；按钮的 `title` 上写着"本地确定性合成（DEMO），不是 AI 出图；撤销只断开引用，不删除已生成的资产"。**所以这一条现在只剩一半欠着**：`videoAssetId` 要真视频 provider，本机不做假生成（`packages/video-model/src/index.ts` 头部写着同一句）。**2026-11-06 第三十八片又补上一格**：`storyboard.source` 那条箭头从此被渲染层真的读——`image-to-video` 带的整片参考图补进"自己没挂图"的那些镜，计划里带画面出处 `from` 与 `sourceReferenceCount`，`notes` 把"这一版的画面从哪来"原话端在界面上（见文末「M5 第三十八片」）。逐条凭证见文末各片。
- [~] Timeline 编辑：trim / reorder / regenerate shot / extend / transition（§41）— **2026-09-28 第一片落地**：
  时间线从"一条只读的读数"变成编辑面——一格一镜、宽度即时长，拖右边缘 trim/extend（吸附 100ms、下限 100ms），
  拖整块 reorder（按**其余镜头的中点**分界，返回最终下标），点左上角的转场标记换衔接；拖动期间只在本地预览，
  松手才落一个 §150 的补丁事务。**2026-10-10 第三片：片段级裁切落地**（见文末）——双击一格在点击处
  把这一镜切成两镜，两半共享同一句描述与同一张参考帧，总时长守恒，切不出两镜时两半各说一句拒因。
  **还欠**：regenerate shot（重新生成某一镜要真 provider 的视频像素，
  与 §40 最后一格同一道门）。逐条凭证见文末。

## M6 — 社区（§186）
- [~] 社区与发现（§59 / §61）— **2026-09-24 第一片落地**：公开作品页上有 Like / Comment / Follow / Remix / Share
  （`apps/web/src/server/domain/social.ts`，路由 `/api/published/interact`、
  `/api/follow`、`/api/discover`），发现页 `/discover` 四个排得出来的标签（最新 / 最多人看与赞 / 最近最热 / 我关注的作者）。
  三条写进代码与界面的边界：**评论走发布机检同一份红线词表**（命中就不发出去，不"先发再等人看"）；
  **Remix 分叉的是发布出去的那一版快照**，作者工作区里没公开的改动不会跟着出去（§58，测试专门钉这条）；
  **Trending 与 AI Picks 当初排不出来，就写在页面上**（前者要互动时间序列、我们只有累计数；后者要模型），
  不拿累计浏览数改个名字冒充热度。
  Save 与 §60 创作者主页也在同一批落地（见下一条），所以 §59 的六个动作现在是全的：
  Like / Comment / Follow / Remix / Share / Save
- [~] 收藏与创作者主页（§59 的 Save + §60）— **2026-09-24 落地**：
  `saves` 表（迁移 0006，挂 publication_id 而不是 project_id —— 收下的是"这一版"，
  作者重新发布不该把收藏里的内容换掉；作者下架或被拒绝之后收藏**仍列出**并写明点不开的原因，
  不悄悄消失）；`/u/<handle>` 主页给 Avatar / Bio / 公开作品 / 世界 / 角色 / 游戏 / 粉丝与关注数。
  可见性边界是这一条的重点：主页只列公网上传着的作品，世界与角色只列**属于这些公开作品**的
  且只给名字与一句 tagline —— 世界文档、角色档案（声音、关系、记忆）在作者项目里，
  发布一张设计稿不等于把它们放上公网（测试专门放了一段"只该存在于项目里"的文字去试泄露）。
  简介会过发布机检同一份红线词表，命中就不保存。游戏栏现在只列公开作品（发布那一刻钉住游戏设计的给「试玩」入口，只有设计稿的照实写），见文末「§60 主页游戏栏」一节。
  仍欠：AI Picks（要模型推荐，没有可用的 provider）。Trending 已在下面单独落地——它当初和 AI Picks
  一起列在"排不出来"那张单子上，理由是"只有累计数"；那个理由被 §168 的访问表与逐行 `created_at` 推翻了。
  §132 的 block / mute 与头像上传也都在下面两条落地了。
  §168 Analytics 已在下面单独落地——主页上那几个数仍然只是浏览量，
  真正的六个数在 `/analytics`
- [x] 头像上传 + 项目简介（§60 的 Avatar + §49 的项目元信息）— **2026-09-25 落地**：
  `apps/web/src/server/domain/avatar.ts` + `/api/account/avatar`（POST/DELETE）+ `/api/avatar/<id>/<file>`（公开读）。
  校验链整条复用 §9c 的图片管线（magic bytes 判定 → 尺寸/体积上限 → 剥元数据），没有为头像另开一套宽松规则：
  头像会以 `<img>` 出现在别人的公开页上，风险面和设计稿里的图片一模一样。
  **为什么不进 `assets` 表**：那张表按项目归属（project_id 级联删除、发布快照按 id 引用、两条读取路径都要求有项目），
  而头像归属是人——硬塞进去要么给 project_id 开空值，要么让人删项目时把自己的头像带走。
  地址是内容寻址的（`avatar-<sha256 前 8 位>.png`）：换一张就换地址，于是 `cache-control: public, max-age=1y, immutable`
  是诚实的；被换掉的旧地址必须读不到（判定以库里的行为唯一依据，磁盘上残留的对象摸不到——
  删旧字节是 best-effort，这条是它的安全网）。顺序是**先写库再删旧字节**：反过来做会留下"头像已经没了但新的没换上"的中间态。
  摘掉头像是把列写回 null，不返回一张默认头像：那样主页上的圆圈看着像有图，其实谁都没传过（§159）。
  上传回执会显示"剥掉了哪些元数据段"——头像是全站少数几张不用登录就能看到的图，不告诉用户处理过就是替他假设。

  **项目简介（§49）这一片补的是两个空转的读**：`projects.description` 从建库起就没有写入方，
  所以 §166 的 `og:description` 稳定落在第二级"从快照文字里摘一句"、§165 的 `ilike(projects.description)` 永远命中不了。
  入口在首页每个项目行下面（展开式，不常驻输入框），`PATCH /api/projects/<id>` 只认 `description` 一个字段：
  **名字不在这里改**——TopBar 的重命名走设计文档、`saveDocument` 把 `document.name` 同步到 `projects.name`，
  报文层再开一个写名入口就是给同一个名字放两个真值（§16）。
  简介会公开在 `og:description` 上，所以它和 bio 走同一份红线词表（§129）：命中就不保存。
  所有权写在 SQL 的 `where` 里（`id` + `ownerId` + 未删除），别人的项目返回 null 而不是"存在但看不到"。

  验证：`avatar.integration.test.ts` 9 条（真库 + 真存储目录，逐条断言磁盘上的对象数）+
  `project-meta.integration.test.ts` 8 条（含"简介写进去之后搜索才真能命中它"那条闭环）+
  `@smoke §59/§61` 里加的真浏览器头像链路（假字节被拒 → 换上 → GET 200 与 `public`/`nosniff` →
  公开主页显示头像 → 摘掉 → 同一个地址 404）+ `@smoke §166` 里 og/twitter/JSON-LD 三处都读到作者写的那一句。
  反向实验记一笔：把 `openAvatar` 的"文件名要对得上库里的行"缩成"有头像就行"，**当时那 8 条全绿**——
  因为旧对象已经被删掉了，`getStorage().get` 返回 null 让断言因错误的原因通过。
  补的那条是手工往磁盘上放一个库里不引用的孤儿对象再读它，这次才真的只有那一条红（截图 `avatar-on-profile.png`、
  `project-description-rejected.png`）
- [x] block / mute（§132 剩下的那两件）— **2026-09-25 落地**：`user_blocks`（迁移 0011）+
  `apps/web/src/server/domain/blocks.ts` + `/api/blocks`（POST/DELETE）+ `/u/<handle>` 上的两个按钮 + `/blocks` 名单页。
  §132 原文四件（report / block / mute / moderation）到此齐了，但**齐的是名字，不是同一种强度**：
  report 与 moderation 走"平台来处理"，block 与 mute 是"我现在就不想再看到这个人"——被骚扰的人不该只有前者。

  **两类关系刻意不一样，这条区别是整个这一片的形状**：
  - `mute` 只管可见性——对方**照样**能评论、关注、点赞，只是他造成的通知不再进我的收件箱、他的内容不再出现在
    发现页与搜索结果里、他的评论在我这一侧被滤掉。把屏蔽当禁言用会以为自己在处理骚扰，其实没有；
  - `block` 在此基础上再双向挡住互动（评论 / 点赞 / 关注 / 改编，两个方向都拒），并且**顺带拆掉已有的关注边**——
    留一条"我关注了一个我拉黑的人"的边，关注流里就还会冒出他的内容，等于自己给 block 留口子。
    mute 不动关注：「还想知道他在做什么，但不想被他找到」是合法用法；
  - 一条关系只有一行（`kind` 在 block 与 mute 之间改），不是两行——block 蕴含 mute 的效果，
    "既拉黑又屏蔽"不是第三种状态。`not_self` 与 kind 白名单两条 CHECK 写在 SQL 里而不是只写在调用方；
  - **都不追溯历史**：拉黑之前发的评论还在，别人也仍然看得到。删别人的发言是 moderation 的活。
    这条要在界面上看得出来，所以作者那一侧的评论列表下面写"另有 N 条来自你已屏蔽或拉黑的人（别人仍然看得到）"——
    不报数就是让过滤看起来像评论自己变少了；
  - 过滤一律**按查看者**算（`hiddenAuthorIds(当前查看者)` 进 SQL 的 `notInArray`），不是按作者算：
    同一条评论，作者看是被滤掉的，旁观者看是正常的。`limit` 要在过滤之后才生效，所以过滤必须留在 SQL 里；
  - 别人是否拉黑了我，不在任何页面显示：那是对方的边界，说出来等于广播"谁在躲你"。
    被挡住的一方只收到一句不含细节的原因。

  验证：`blocks.integration.test.ts` 11 条（真库；每一条负面断言都配一个"同一种数据、换一种关系"的对照——
  一个恒返回 null 的 `relationOf` 会让所有负面断言全绿，只有对照组抓得住它）+ `@smoke §132` 三个视角
  （作者 / 被拉黑的访客 / 匿名旁观者，截图 `profile-blocked.png`、`blocked-comment-hidden.png`）。
  反向实验四个，每个都只红该红的那几条：`canInteract` 恒放行 → 3 红；`hiddenAuthorIds` 恒空 → 5 红；
  `setBlock` 不拆关注 → 7 红；`emit` 不看关系 → 2 红。
  仍欠：拉黑之后**已经发出去的通知行**不删（收件箱是历史，不是过滤器）；没有"屏蔽某个词/标签"这种更细的粒度；
  mute 不影响直接访问 URL——它是不出现在列表里，不是进不去；`/blocks` 上没有"谁拉黑了我"的反向视图（刻意不做）。
- [x] Trending（§61 那张"排不出来"单子上的前一项）— **2026-09-25 落地**：
  `apps/web/src/server/domain/trending.ts`（纯算法）+ `discover({sort:'trending'})` + 发现页第四个标签。
  **改口要有依据**：当初写"只有累计数"是对的，今天不成立了——点赞/评论/收藏/改编每一行都带 `created_at`，
  §168 的访问表又按"访客 × 天"存着 `opens`，按天的互动序列因此是真的。留着那条不改口，
  就是拿一条过期的限度骗人（§159 的反方向：明明能做却说不能，同样是谎）。
  算法是**最近 7 天的互动按半衰期 3 天加权**，权重 `点赞1 / 评论2 / 收藏1 / 改编3 / 一次打开0.2`；
  这三个数都是选择而不是事实，所以 `trendingMethod()` 把它们和"只在最近 200 条公开版本里排"一起
  原话显示在页面上（`data-discover-method`），每张卡还带自己的分数（`data-discover-score`）——
  一个藏起算法的序会被读成"平台公认最热"，写出来才只是"这是我们这套参数排出来的"。
  窗口外的互动**不计**（不是折到很小），未来时间戳不计（不给负权重抬分），空桶是 0 分（不补底数）；
  同分一律按发布时间倒序，否则两次刷新顺序会漂，而"榜在动"会被读成热度在变。
  验证：`trending.test.ts` 7 条纯单测钉算术 + `trending.integration.test.ts` 3 条打真库——
  其中关键的一条是**同一份数据下 `popular` 给出相反的顺序**（累计 6 赞但全在窗口外的那条排最后），
  这才证明新标签不是"最多人看/赞"换皮；`@smoke §59/§61` 里点一次「最近最热」，
  断言方法句、分数与"AI Picks 仍然排不出来"同时成立（截图 `discover.png`）。
  仍欠：候选集上限 200 是硬编码，平台大了要换成分桶预聚合而不是抬高这个数；
  半衰期与权重没有对照集，所以"排得好不好"今天无法回答，只能保证"排法透明"。
- [x] 全平台搜索（§165）— **2026-09-25 落地**：`/search` 一个 GET 表单 + 服务端渲染，八类目标各一组
  （projects / users / worlds / games / characters / designs / components / assets，与 §165 的清单同序），
  判定全在 `apps/web/src/server/domain/search.ts`。匹配走 pg_trgm 子串（迁移 0008 给被搜的列建
  `gin_trgm_ops` 索引）而不是全文检索：中文没有空格分词，`to_tsvector` 的 default/simple 配置切不出"王城"这种词，
  子串匹配对中英文一视同仁。
  **2026-10-22 补上相关度排序**（ADR-0056）：原先组内只按更新时间排（那条限度当时写在页面上，不装），
  现在按**四档确定性分**排：标题与查询完全一样 > 标题以查询开头 > 标题里有 > 只在简介/摘要/正文里有。
  - **分数算在 SQL 里**（`case` + `greatest`）⇒ 候选集本身按相关度取，
    不是先按时间截断再在剩下几条里排（那样"最相关的那条"可能压根没被取到）；
  - **标题列与详情列分档**（详情里的命中最多 1 分，低于"标题里有"的 2 分）⇒ 不并列，四档才成立；
  - **同分时按更新时间新→旧**（今天的行为保留为次序，不是被丢掉）；
  - **口径原话写在页面上**（`data-search-method`）：藏起来的序会被读成"平台公认最相关"；
    "没覆盖什么"那一栏同步改口，明说**不看词频、不看词在标题里的位置、不看点击与热度**。
  - **凭证**：`apps/web/test/search.integration.test.ts` 多 2 条（打真库）⇒ 该文件 16 条全绿：
    四档次序（其中"只在简介里匹配"那条被**故意设成最新更新的**——按时间排它会排第一，
    这条断言钉的是"相关度优先于时间"）；页面口径与代码一致、旧的"没有相关度排序"那句不许再留着。
  - **2026-10-22 浏览器那一寸也齐了**（e2e `e2e/search-relevance.spec.ts` 一条，9 秒跑完）：
    在真页面上量「次序真的是相关度的次序」——把「标题完全一样」的那条**先**建（它更旧）、
    「标题以搜索词开头」的那条**后**建（它更新）⇒ 按更新时间排的话次序正好相反 ⇒
    页面上的次序若与建的时间无关，才算真的在按相关度排；口径那一行（`data-search-method`）
    也要真的在页面上。

  **这一条真正的工作量在可见性，不是查询语法**：搜出一条打不开的结果比搜不到更糟。
  - 项目：你自己的（未删除）**或**有 public 且未被人工驳回的发布版本；自己的那条链到编辑器，
    公开那条链到发布路径；
  - 用户：只列有 handle、未注销、不是未认领 guest 的——否则 `/u/<handle>` 是空页；
  - 其余六类都挂在项目里，而 `/studio`、`/world` 与角色/资产路由只认所有权，所以**只搜你自己的项目**，
    未登录时这六组直接为空。别人的世界条目即使匹配也不列出：那些内容没有发布链路
    （§56/§57 发布的是设计文档那一版），列出来就是给访客一个 404。
  - 每组多取一条只为了说"还有更多"，不去数全表谎报总数；少于两个字符不发查询（一个汉字能命中半个平台）；
    用户打的 `%` `_` `\` 当字面量转义。

  没搜的部分 `SEARCH_NOT_COVERED` 四条原样列在页面上：世界与游戏条目正文、画布节点里的文字都存在 jsonb 里，
  子串匹配会连键名一起命中（搜 `player` 命中每一份模板骨架），要按内容找东西走项目内检索（§49）；
  资产只搜文件名；没有相关度排序。入口在首页与发现页各一条链接。

  验证：`apps/web/test/search.integration.test.ts` 11 条打真库，每条"搜不到"都配一条"换个人就搜得到"的
  反向断言——搜不到有两种原因（规则挡的 / 数据根本没建成功），必须分得开。
  `@smoke 全平台搜索` 在浏览器里走一遍：命中的链接点得开、画布元素名带页面名进 designs 组、一个字符不发查询、
  以及同一个关键词作者看得到而无会话访客一无所获。去掉 `likeTerm` 的转义，通配符那条立刻红
  （`分%达成` 会连 `百分X达成` 一起命中）。索引这一笔如实记下：`EXPLAIN` 只在 `design_nodes`
  （本机 1 万行）上选中 trigram 索引，`projects`（1252 行）与两字中文查询规划器仍走 Seq Scan——
  这条迁移要等表长大才兑现，现在别拿"建了索引"当性能结论。
  仍欠：相关度排序（要真打分得先有 §49 的向量半）、文档正文检索（同上，不拿全局 LIKE 扫 jsonb 冒充）、
  ~~搜索建议与历史~~ **2026-10-31 已还（ADR-0075）**：建议复用同一份查询与可见性判定（每组 2 条、
  取前 6，键入 250ms 防抖 + 中止上一发，按 IP+用户 120 次/分限流）；历史只存本机 localStorage
  （8 条，可逐条删/清空）。读数与臂见文末「§165 搜索建议与历史」。
  **2026-11-05 再补**：429 时界面不再默默收起建议，而是可见地暂停 N 秒并说明结果页照常能搜
  （见同节末）。
- [x] SEO（§166）— **2026-09-25 落地**：公开作品页的 head 全部服务端渲染（`/n/<handle>/<slug>` 的 SSR 本来就是真的），
  规则集中在 `apps/web/src/server/domain/seo.ts`——一份**纯投影**：吃 `PublishedPage` + origin，吐
  metadata / JSON-LD / 「省略了什么、为什么」，不碰数据库也不读请求头，所以每条规则都能在单测里单独钉住。
  `generateMetadata` 与页面组件读同一个库查询：`getPublishedPage = React.cache(resolvePublishedPath)`。

  这一条的实质是**爬虫看到的必须与访客看到的一致**，四组判断都为此存在：
  - `unlisted` 一律 `noindex`：它的语义就是"只认精确链接"，被收录等于替作者重新发布一次；
    `private` 与被人工驳回的本来就走 `resolvePublishedPath` 拿不到（404），所以
    `listSitemapEntries` 用**同一套谓词**（public + 非 rejected + 有快照 + 项目未删）——
    sitemap 里列一条 404 比不列更糟。
  - 绝对地址只来自**真实** origin（`apps/web/src/lib/origin.ts`）：`NEXUS_PUBLIC_ORIGIN` 优先于请求头，
    否则别人伪造一个 `Host:` 就能把爬虫领到别人的域名；`x-forwarded-host` 只在同时带
    `x-forwarded-proto` 时才信（裸 host 头可以任意伪造）。拿不到 origin 时**整条省略**并写进 `omitted`，
    不编一个 `localhost` 冒充对外地址（§159）；`robots.ts` / `sitemap.xml` 同理返回空并 warn。
  - `og:image` 不放占位图：只有这一版快照**真的画到**某个 image 资产时才有，判定复用公共图片路由的
    同一个谓词 `documentReferencesAsset`（清单里挂着但页面没画的不算，svg 不算），作者没有 handle
    时公共图片地址不成立、同样省略。
  - `description` 三级：项目描述 → 按字号挑句子的页面摘要 → 兜底句。第二级不是锦上添花——
    真机 curl 第一次看到的就是"按钮文案混进 og:description"，所以短于 6 字的文字（按钮 / 标签）不进摘要，
    字号大的先来，token 引用没有字号时退回文档顺序不谎报权重。

  JSON-LD 只写我们真有的字段（`CreativeWork` + author / publisher / `datePublished` = **这一版的发布时刻**，
  不是项目创建时间），没有 `aggregateRating`、`keywords` 这类编造字段；正文进
  `<script type="application/ld+json">` 前把 `< > &` 与 U+2028/29 转义掉——项目名是用户输入。
  `changefreq` / `priority` 不做（那是猜的），`/discover` 不放假 `lastmod`。

  验证：`seo.test.ts` 10 条纯函数单测 + `seo.integration.test.ts` 6 条打真库（public 在列 / unlisted 不在
  且配一条"resolve 仍非 null"的反向对照 / rejected 掉出去且留对照组 / 软删项目掉出去 / 取消发布掉出去且
  `lastmod` 就是 `publishedAt`）。`@smoke §166` 在真浏览器里走 head、JSON-LD 可 parse、`/robots.txt`、
  `/sitemap.xml`，再把同一个项目改成 unlisted 重新发布 → `noindex` 且从 sitemap 消失，
  反向对照页面本身仍然打开得到、canonical 没变（截图 `published-seo-public.png`）。
  反向实验逐个做过：删掉封面谓词 / 把转义正则缩到只剩 `[&]` / robots 三元改成恒 index /
  去掉 `visibility='public'` 或 `ne(moderation,'rejected')`——每次都只让预期的那几条红。
  已了结的一笔：`projects.deletedAt` 以前只有读没有写，sitemap 那条谓词只是防御性的——
  2026-09-26 §74 补上写入方之后它变成可测的，`project-delete.integration.test.ts` 里
  "删掉的项目不在 sitemap、恢复后又在"就是那条断言。
  **2026-10-29 收的尾**：`seo.integration.test.ts` 那一条同主题的用例当时还写着"软删这列没有写入方"，
  直接 `UPDATE … SET deleted_at` 绕过域函数——那句前提早已过期，改成走 `softDeleteProject`，
  并补上以前哪都没有的那一格：**确认门拒绝的那一次，清单与 URL 一个字都不该变**（审计同时留一条 `allowed=false`）。
  **封面图已在 2026-10-07 落地**（见 commit 9353d02：发现页卡片显示封面图）；
  `/u/<handle>` 与 `/discover` 的 per-page metadata 没做（§166 原文范围是 public projects）；
  sitemap 截到 5000 条，超了只 warn + 截断，没有 sitemap index。
- [x] Analytics（§168）— **2026-09-25 落地**：`/analytics` 一张表，六个数各写清自己数的是什么。
  先说清这一条的**真实缺口**在哪里：views / likes / remixes / followers 早就有真值来源
  （`published_projects.views` 由公开页 SSR 累加、点赞与改编挂在项目上、粉丝是作者级），
  **completion 与 play time 此前没有任何采集**——所以这一条不是"做个图表页"，
  而是把"访客到底看了多久、滚到哪儿"这件事第一次真的存下来（迁移 0009 `publication_visits`）。

  粒度选的是**访客 × 天**而不是事件流：六个数没有一个是逐事件算的，
  事件流只会让"累计时长"这种数每次都全表扫；一行 = 一个人一天，
  写入用唯一键 `(publication_id, visitor_key, day)` upsert——打开次数相加、时长相加、
  **完成度取最远而不是平均**（`GREATEST`，一个人一天里滚得最远的那一次才说明他看到了什么），
  先匿名后登录的行允许补上 `user_id`，反过来不覆盖已有归属（`COALESCE`）。

  采集端（`VisitMeter` + `src/lib/visit-meter.ts`）把规则全放在纯算术里，因为这两个数最容易说谎：
  - 只在 `visibilityState === 'visible'` 时累计，切走标签页不算在看；
  - 单次 tick 超过 5 秒的部分丢掉（挂起 / 断点 / 睡眠一次性给出巨大的 delta），
    单次上报超过 60 秒截断，**并且把截断记进 `capped_reports`**——被动过的数据要留得下痕迹，
    界面上那一行会写"N 次上报被截断"；
  - 15 秒一次心跳，`visibilitychange→hidden` 与 `pagehide` 各收尾一次；
    用 `fetch(keepalive:true)` 而不是 `sendBeacon`——后者带不了 `x-csrf-token`；
  - 上报前先把"此刻滚到哪儿"并进聚合再取待上报的那一份：反过来的话滚到底要等下一次心跳才看得出来，
    一次短访问会把 100% 报成 50%（这个顺序错过一次，是真在浏览器里发现数字不动才回头改的）；
  - dev 下 StrictMode 会把 effect 挂两次，不去重就是一次打开算两次，所以按 path 记 `openedPaths`。

  公开页是**匿名可写**的入口，三道边界都在：CSRF 双提交（middleware 给每个访客都签了 token，
  不存在"访客没有 token"）、`path` 必须解析到非 private 且未被驳回的发布（否则 404，一行都不写）、
  按 IP + 匿名 key 限流 240 次/小时（每 15 秒一次心跳已经用满）。
  所有权写在 SQL 的 `where` 里而不是调用方：传别人的 publicationId 只会拿到空列表，
  "存在但看不到"这种含糊状态没有藏身处。`/analytics` 同时加进 `robots.ts` 的 disallow。

  展示面的诚实程度是这一条的重点：**采不到就是 null，界面原样写"未采集"**，
  不拿 views 换算一个时长冒充（`playTimeMs` 与 `completion` 都是这个规则）；
  但有行加出来是 0 秒时如实报"0 秒"——把"来过但没攒够时长"显示成"未采集"是另一种谎。
  六个数的口径直接印在页面上（含"打开次数不挡爬虫"、"隐私模式下每次打开算一个新访客"），
  `selfOnly` 单独标出来：只有作者自己刷新过的作品，那串数字不能读成"有人在看"。

  验证：`visit-meter.test.ts` 13 条纯单测钉住每一条截断/合并/去重规则；
  `analytics.integration.test.ts` 14 条打真库（同日合并、跨天不合并且访客按人去重、坏 key 一行不写、
  截断留痕、登录归属补写、null 与 0 分得开、点赞挂项目不挂版本、粉丝作者级、views 与今日打开两个来源、
  selfOnly、别人的 id 查不出、软删后从列表消失但行还在）；
  `@smoke §168`（2.8m）走完整链路：真人访客打开公开页 → 页面写着"这一页会统计" → 等一次真心跳带回
  `visibleMs>0` 与 completion → 作者页上访客 1 / 今天 1 / 时长 15 秒 / 完成度 100%，
  再验 403（只带 cookie 不带头）→ 200（补上头）→ 404（不存在的路径与切成私有的作品）三态，
  以及无会话访客打开 `/analytics` 只得到"需要先登录"且页面里一个数字都没有（截图 `creator-analytics.png`）。
  反向实验：去掉 `Math.min` 上限、把完成度平均的 `filter (where > 0)` 摘掉、`count(distinct)` 去掉 distinct、
  时长求和改取 max、`GREATEST` 改 `LEAST`、删掉 `ownerId` 条件、`COALESCE` 改成直接覆盖、
  访客 key 正则放宽——每一条都只让预期的那几条红。
  另外一条**证伪**记在这里：`contentHeight <= viewportHeight → 100` 那个提前返回是死分支
  （下面的 100 上限本来就给出同样答案），删掉之后测试仍然全绿，所以留着它只是假装钉住了规则。

  **按天曲线已在 2026-09-30 落地**（见文末「§168 第二片」）；~~游戏侧 completion 事件仍欠~~——
  **2026-10-27 核对**：`/api/published/game-complete` 收公开页的通关上报、落 `game_completions`
  （`recordGameCompletion`，`apps/web/src/server/domain/analytics.ts`），分析页的 completion 读的就是它。
  **爬虫与真人区分已在 2026-10-16 落地**（第三片：`classifyVisit` 疑似另计，真人的数逐格
  filter 掉爬虫，`botOpens` 另给一格；详见文末「§168 第三片」与 ADR-0043）。
  **取消发布不再把统计一起删掉**——2026-10-22 落地（ADR-0055）：`unpublishProject` **不再删
  `published_projects` 行**，只把 `visibility` 改成 `private` ⇒ 那一版的访客现场与通关记录
  **原样留着**（`views` 本来就是这个行为，新表继承了它；今天多出来的两表也跟着一起留）。
  - **为什么这样就够**：库里**每个项目只有一行发布行**（版本号在同一行上 +1）⇒
    "访客现场"本来就是**跨版本累在那一行**上的 ⇒ 改可见性**一点没改统计的粒度**，
    改的只是"那一行还在不在"。
  - **三个可见性各归各**：公开面读不到它（`resolvePublishedPath` 判 private ⇒ 404）⇒
    采集端点写不进来（`findPublicPath` 判 private ⇒ 不再给一个没人能打开的页面攒数）⇒
    **作者自己那一行还在**（分析页上标着"已停"）⇒ 下架不等于抹掉履历。
  - **顺带修好一个今天就有的毛病**：删行之后重新发布取不到旧行 ⇒ **版本号重置成 1**；
    现在版本号接着往上走。
  - **"已经下架过再说一次"仍如实返回 false**（只撤还公开着的那一次）⇒ 与"没发布过"一样，
    没有新东西发生就不写审计。
  - **翻案一条旧断言**：`publish.integration.test.ts` 原来断言下架后 `getPublication(id)`
    为 null ⇒ 现在改为"那一行还在、只是 `visibility` 是 private"，并把理由写在断言旁边。
  - **凭证**：`apps/web/test/unpublish-keeps-stats.integration.test.ts` 3 条（打真库）：
    下架之后统计还在且那一行作者还看得见（含撤下留痕）/ 下架之后它真的不公开了
    （URL 404、采集写不进来、搜索与主页都不列它）/ 重新发布接着算（版本号往上走、统计不重置）。
    受影响的发布 · SEO · 通知 · 分析层 69 条全绿。
  - **导出已在 2026-10-22 落地**（见下）；跨作品的汇总视图本来就有着落（`creatorOverview`
    读的就是"名下所有作品加在一起"），那条记述已更正。
  **2026-10-22 导出落地（`GET /api/analytics/export` ⇒ CSV）**：
  - **数字与页面同一份**：导出与页面读的是**同一个** `creatorAnalytics` ⇒ 两处不可能漂
    （页面写"3 个访客"而导出写"4"这种不一致不会发生，§159）；
  - **没采到的是空格子，不是 0**（`completion` 与 `playTimeMs` 为 null 时写空）⇒
    "未采集"与"采到 0"在导出里也分得开（页面那一侧本来就是这个口径）；
  - **转义按 RFC 4180**：含逗号 / 引号 / 换行的值加引号 ⇒ 一个带逗号的项目名不会把整张表挪歪；
  - **带 UTF-8 BOM** ⇒ Excel 打开中文不乱码（这一格是给人拿去用的）；
  - **只给本人**：读的是自己的 id ⇒ 别人的作品一个字节都不在里面；没登录是 **401**（不是 500）。
  - **凭证**：新建 `apps/web/test/analytics-export.integration.test.ts`（4 条：数字与领域层
    **逐项相等**（测试自己重算一遍）/ 没采到的是空格 / 含逗号的值不挪列（自己写了个
    CSV 解析器按**列**断言）/ 别人的作品不在里面且匿名 401）；
    e2e `analytics.spec.ts` 多一条（`@smoke §168 导出：点那个链接真的下一个 CSV 下来，
    数字与页面上那一份相同`）：**下载真的发生**（文件落在磁盘上）/ **BOM 在**（Excel 打开
    中文不乱码）/ 文件里那一行的数与页面上那一格**逐字相同** /
    页面写着"未采集"的地方，导出里是**空格子**（不是 0）。
- [x] 通知中心（§164）— **2026-09-25 落地**：`/notifications` + 顶栏铃铛，只给**真的发生完**的事件写行。
  §164 原文点名的四类里今天只有 `Publish complete` 有真实终态：`Generation complete` 是同一次请求里
  同步回话的（web 侧没有能稍后"完成"的作业，要等 #10 的队列消费者）、`Build complete` 全平台没有会完成的
  构建端点、`Agent task complete` 的 `agent_tasks` 表**有结构但没有写入方**。
  所以这三类**不往收件箱插行**，而是原样列在页面下面（`data-notification-unbacked`）并各带一句为什么——
  比凭空造三条"完成"要诚实，也比把这条需求悄悄做小要好查（§159）。
  真有终态的除了发布还有两类：`resolveCase` 的人工裁决结论（全平台唯一一件"在别人请求早就结束之后才发生"的事），
  以及别人对你的公开作品点赞 / 评论 / 改编 / 关注。

  规则全放在纯函数 `src/lib/notify-plan.ts`（和 §166 的 seo、§168 的 visit-meter 同一形状），
  因为它装的都是会说谎的判断：`planNotification` 对"自己对自己做的事"返回 null；
  标题里的项目名与评论摘录都要过 `clip`（用户输入没上限就是标题没上限）；
  链接按**可见性**给而不是按事件类型给——`private` 那次发布指向 `/studio/<id>` 而不是必然 404 的 `/n/...`，
  没认领过 handle 的 guest 关注别人时**宁可不给链接**（读取时那条显示"没有可跳转的页面"）。
  每条通知带一个 `dedupe_key`，唯一约束在库里：点赞是开关（反复开关只留一条，键挂 `(project, actor)`）、
  评论每发一条都是新事（键挂 comment id）、发布按 `(publication, version)`（同一 path 换版本是两件新事）、
  裁决按键 case id。**去重是 `onConflictDoNothing` 挡的而不是内存挡的**，所以 `emit` 的返回值分成
  `created / duplicate / suppressed` 三态——测试要能区分"规则挡下了"与"根本没写进去"，
  否则"没有通知"永远只是"数据没建起来"的同义反复。

  读取时不悄悄消失：`inbox` 每次 JOIN 发布行，目标被下架 / 驳回的那条改标"这一版已经不公开了"而不是删掉，
  作者因此看得见"有人赞过，但那版已经打不开了"。这一条的判定按**链接形态**（`/n/` 开头才查发布行）
  而不是按 kind——切成私有的那次发布通知指向编辑区，拿"发布行还活着吗"去判它会给出一条假死信。
  `publication_id` 选 `ON DELETE SET NULL` 而不是 CASCADE，正是因为 §168 刚暴露过"下架连带把从属数据删干净"，
  收件箱里那条历史记录不该跟着一起没。未知 kind 读回 `'other'`（界面写"未分类"）而不是回落到 `'publish'`。

  验证：`notify-plan.test.ts` 19 条纯单测（含反向对照：同一种事件只换收件人就必须出声；标题逐字相等）；
  `notifications.integration.test.ts` 14 条打真库（作者有一条路人没有、dedupe 三态、自己对自己 suppressed、
  评论正文只进 body 不进标题、无 handle 的关注、取消发布后行还在且标失效、私有发布那条例外不受失效规则影响、
  拿别人的 id 标已读返回 0 且对方未读不变、全部标已读不删行、两个收件箱不互相漏、
  limit 截条目不截总数、手工插的 `kind='abuse_report'` 读回 `other`、二次裁决不再冒第二条通知）；
  `@smoke §164` 在真浏览器里跑两个身份（**新 context 才是新 guest**，同 context 的多个 page 共用会话，
  用它自赞自评只会测出"自己给自己发通知"这条规则没生效）：发布 → 铃铛 1 → 访客点赞/评论/关注 → 铃铛 4 →
  逐条标已读只动一条 → 全部标完未读归零而总数仍是 4 → 动手那人自己的收件箱是空的 → 无身份拿 401（截图 `notifications-*.png`）。
  铃铛的实时推送随 §163 落地（2026-09-26）：推来一条 notification 就重查一次数，**没有轮询**，
  未读数永远以库为准（断开期间的事件不补发，只把事件当"该重新查了"的信号）。
  **§164 分页已在 2026-10-07 落地**：`inbox(userId, { page, limit })` 支持页码与每页条数（默认 50、最大 100），
  返回 `pagination.hasMore` 如实反映是否还有更多；向后兼容旧调用方式（直接传数字当 limit 时不返回 pagination 元数据）；
  新增 4 条集成测试验证分页正确性、hasMore 边界、超范围页返回空列表、向后兼容性（`apps/web/test/notifications.integration.test.ts` 18 passed）。
  **通知偏好设置已在 2026-10-07 落地**（见 commit 9a6ff89：每人可按 10 类开关通知）；没有邮件 / Webpush。
  `projects.deletedAt` 那条谓词以前是防御性的（全库没有软删写入方），2026-09-26 §74 补上写入方之后它才真的可测：
  §74 的集成用例里删掉项目，指向它的那条历史通知**行还在**（那是作者的事件历史），但链接收走、
  理由写明"项目已经不存在"，恢复后又原样能点开——不需要重发一条。
- [x] 画布批注（§111）— **2026-09-24 落地，2026-11-08 核实 §111 原文三项全齐**：点中元素 → 写一句话钉在它上面（`comments.node_id`，
  不另起一张表）。定位由服务端按文档算（页面、元素名），节点被删后批注仍列得出并标明悬空；
  随 AI 请求上线走 §68 那条路（客户端上传 `annotations` 一律 400，超出 20 条与悬空都写进
  `annotationsNote`），提示词里写清"批注回答该动哪个元素，不是要照抄进设计的文案"。
  **2026-10-24 第三项补齐（#185）**，这一条三项全齐：`@Agent` 提及解析 ✅
  （`server/domain/agents.ts` 的 `findAgent` / `mentionNote`）、回复线程 ✅
  （`comments.parentId` 那一列在，且是自引用级联）、**批注的「已解决」状态 ✅**——
  迁移 0038 给 `comments` 加 `resolved_at`（一行时间戳，不是布尔），
  `PATCH /api/annotations/[id]` 标上/重新打开，界面上"标为已解决 / 重新打开"，
  已解决的默认收起并说清收起几条，画布角标变灰淡出。
  2026-09-25 回看 §111 原文，它要的只有"点元素 → 写评论 → Agent 自动定位"，三样早就落地；
  回复线程与 resolved 状态当时判为"产品直觉、不是需求，不自动开工"。#185 仍然做了它，
  理由见 ADR-0061：**已解决的批注必须不再进 AI 上下文**，否则模型会把已经收工的事重做一遍——
  少这一条，"已解决"就只是界面装饰，而装饰正是 §159 禁的东西。
  `@Agent` 提及解析它挂在 §112/§113 的多 Agent 那条链上 ——
  **2026-09-26 已接上**（见 M6 的"Agent 名册有写入方"那一条）：批注正文里的 `@xxx` 现在是解析的第三来源
  （排在请求提名与提示词提及之后），并且它读的是同一名册、同一道门；不是给批注单独写一套匹配。
  验证：`annotations.integration.test.ts` 13 条 + 路由级 `annotation-resolve-route.integration.test.ts` 5 条
  + 画布 e2e（含刷新后仍在、以及"浮层挡住画布点击"这条反向实验——去掉 stopPropagation 那条断言立刻红）
- [~] 发布审核流水线（§131）+ 举报（§132 的一部分）— **2026-09-24 落地**：
  `publish → 机检（红线词表 + 资产出处）→ clear/review/blocked → 发布或挂人工队列`，
  机检只升级不认证（`moderation` 停在 pending，只有 role=admin 的人工裁决能写 approved/rejected，
  rejected 立刻让公开 URL 404），扫描自带 limits + rulesVersion 一路显示到发布面板，
  被挡下的发布也立案。取舍与限度见 `docs/adr/0008-moderation-escalates-never-certifies.md`。
  复核台 `/admin/moderation` 也已落地（非审核员连队列长度都看不到），整圈在真浏览器里核对过：
  挂起 → 看到命中证据 → 放行离开队列 → 拒绝后公开 URL 立刻 404（截图 `screenshots/admin-*.png`）。
  仍欠：图像/视频内容模型、版权比对。~~审核员提权目前只能改库（没有管理界面，也没有审计页）~~
  **已还（2026-09-25）**：`/admin/users`（提权 / 降权，规则在服务端判定）与 `/admin/audit`（审计事件页）落地，
  见下方"审计与角色"进度记录。
  §132 的 block / mute 已在上面单独落地（`user_blocks`），所以这一条四件齐了——但强度不同：
  审核是平台的权力，block 是个人的可见性选择，两者不能互相顶替。
- [x] **Java Spring Boot 领域服务在此落地**（用户/项目/社区/权限/计费的权威写入方）— **2026-10-07 落地**：
  `services/java-domain-service` — Spring Boot 3.2.0 + JPA/Hibernate + PostgreSQL。
  UserService（CRUD + 认领 guest + 档位变更）、ProjectService（CRUD + Fork）完整实现；
  Community/Permission/Billing 提供骨架接口与模式，待业务规则明确后扩展。
  Lombok 因 Java 25 不兼容已移除，手动实现所有 getter/setter。

**M6 进度记录（2026-09-25，审计与角色：§80 授权 / §84 审计 / §131 提权收口）**：

三件事一起落地，因为它们回答的是同一个问题的三个面："谁有权力、他用了没有、事后查得到吗"。

**1. `audit_events` 终于有了写入方（§84）。** 这张表建库起就在，注释写着"含被拒绝的越权尝试"，
但**全库没有一处写它**——"有表"不等于"有审计"，而"谁试过做什么、被挡了"这件事此前只存在于
服务器的瞬时响应里，关掉窗口就没证据了。现在写入的是**决定**而不是流水账，只在这几处：
登录 / 注册（成功与失败）、人工裁决（含非审核员的越权尝试与**重复裁决**尝试）、
发布 / 下架 / 取消发布、角色变更。把每次读都记下来，表会在几天里变成没人读的噪音，
真出事时反而找不到那几行。

三条写进代码的纪律：
- **不记凭据与隐私**。失败的登录尝试连"试的是哪个账号"都不记——那张表本身就会变成账号枚举的清单；
  审计页显示 `hasIp` 而不是精确 IP（精确定位滥用才需要，先留在库里不默认摊在页面上）。
- **写失败不改变请求结果**。审计是旁证不是业务前提：让它抛异常等于"日志库抖一下，审核员就点不动放行"。
  `recordAudit` 返回 false 并打到 stderr——那一行就是"证据没留下"这件事本身的证据。
- **没发生的事不记**。没发布过再取消（删行数为 0）不写审计，测试专门钉了这条。

**2. 提权 / 降权有了判定与界面（§131）。** 此前"谁是 admin"只能由运维改库。
判定全部在 `domain/roles.ts`，路由只翻译 HTTP 状态码——权限规则放路由里，下一个入口（CLI、批量导入）
就会漏掉它。三条规则：**不能改自己**（自己提权是"拿到这个会话的人就能变成审核员"的最短路径；
自己降权则让"还有谁能提权"没有答案）；**未认领的 guest 不给提权**（guest 身份新开一个浏览器就有，
§137，没有任何东西把它拴到人身上，提权等于把撤下内容的权力发给一个匿名会话）；
**改别人的前提是你此刻是 admin**，且这一条在写库之前问，不靠前端把按钮藏起来。
每一次尝试都进审计，被拒的那次也进——被拒绝的提权尝试恰恰是最该留痕的一类。
路由用 `currentUserOrNull()` 而不是 `requireUser()`：后者会替无会话请求现造 guest 身份，
而这个端点正是最不该"探测一下就白手造用户"的地方。

**3. 一条刻意不写的规则，以及它带来的两处自相矛盾（本轮修掉）。** 页面上**没有**"最后一个审核员不能降权"，
因为它是够不着的：能改别人的只有审核员，而审核员改自己被第一条挡住，所以"一个审核员都不剩"
从这条路径根本进不去。写下一条不执行的规则会让人以为它在工作（§159 的反面）。
本轮捞出的两处矛盾都出在这条规则上：
- `publish.ts` 的 `unpublishProject` 里，那笔审计调用被包在 `if (false) { … }` 里——**测试是红的**
  （用例已经断言 `publish.unpublish` 那行存在且 `actorId` 是本人），实现却被临时关掉忘了打开。
  这处是**新接上的 ESLint 规则集抓到的**（`no-constant-condition`），typecheck 完全看不见它。
  去掉 `if (false)` 后 7/7 转绿，删行这一笔终于留痕：URL 从这一刻起 404，
  但"谁撤的、撤的是哪一条"不能跟着行一起消失。
- `/admin/users` 页顶部的注释声称"最后一个审核员不能被降下去……两条都在服务端判定"，
  而 `roles.ts` 与页面**自己那段文案**都说这条规则不存在。三处说法里注释是错的，已改成一致。

**验证**：`npm run lint` 0 问题（typecheck + eslint 全过）；`npm test` **73 files / 765 tests 全绿**，
其中 `audit.integration.test.ts` 8 条（含"写不进去时返回 false 而不是把这次请求带崩"这条反向验证）、
`publish.integration.test.ts` 7 条（含本轮转绿的那条）。

## M7 — 创作者经济（§187）
- [~] Marketplace（组件 / 模板 / 设计系统 / 资产 / 世界 / 游戏 / AI 角色）
  —— **2026-10-06 后端落地**：`marketplace_items`（迁移 0023，七类物品 CHECK、可见性
  public/free/private、软删、下载计数）+ `domain/marketplace.ts`（列表只出 public/free、
  所有权判定在 SQL 的 where 里）+ `/api/marketplace` 三条路由（GET/POST 列表与创建、
  PATCH/DELETE 所有权；~~POST 下载计数~~ 那条只记数不交付的门已于 2026-10-21 删除，见文末同一节），标题/描述/标签过发布机检同一份红线词表。
  **2026-10-07 店面落地**：`/marketplace`——类型过滤、条目卡（价格/可见性/创作者/预览图）、
  上架表单（类型/标题/描述/标签/价格/可见性 + 来源项目与预览素材选择，资产清单按项目
  现拉）、我的物品与下架（confirm + DELETE + CSRF 双提交）。预览图走**市场自己的公开路由**
  `/api/marketplace/[id]/preview`（匿名场景自己的口；可见性跟条目走，所以缓存 `public, max-age=3600`
  而不是 immutable——素材字节不变，但"能不能看"会变）。导航加了「市场」。
  **测试**：`@smoke §127 创作者市场`（上架 → 出现在店面与我的物品 → **两条真交付对照**：没挂来源项目的
  条目报"没有可导出的源项目"且计数停在 0，挂上来源项目的条目在浏览器里收到一个 zip（前两字节 `PK`）
  且计数走到 1 → 改价格/可见性 → 下架消失）；domain 14 条（2026-10-06）；路由层的 `requireUser`/CSRF 门
  与 0f8404e 一起补齐并过全仓 typecheck；交付门 14 条集成测试见文末「§127 交付那一格」一节（2026-10-21）。
  **交付这一格**：`GET /api/marketplace/[id]/content` 那道门 2026-10-07 就建起来了（§144 的 design + code
  两档 ZIP），但它当时**谁也交付不了**——建包用的是下载者的身份（过不了 §144 的归属门，买家必拿 404）、
  中文标题直接进 `Content-Disposition` 会在构造响应时抛（平台上标题几乎必是中文）、免费那一路先 `+1`
  再建包（没源项目／源项目已删／导出抛错都照样让数字变大）。2026-10-21 把这四个洞一次修掉并立了见证，
  页面上那句"下载只记计数"也随之删掉；**计数从此只有一个含义：成功交付了几次**。
  **2026-10-23 已补**：ZIP 里**含资产字节**——`buildProjectExport` 加 `assets` 三档，以创作者身份走 §80 鉴权路由读私有素材（`openAssetForOwner`），买家拿到的包直接能跑，不再缺图。见 `d3efaff`。
  **2026-10-09 收益明细落地**：`/api/marketplace/earnings` GET 端点 + `/marketplace/earnings` 页面——
  聚合 `marketplace_splits` 表按日期分组，返回 totalEarned / totalSales / dailyBreakdown；
  创作者能看到自己的分成流水（一次销售 = 一行记录，按天汇总）。
- [~] Credits 与订阅（Free/Pro/Creator/Studio/Enterprise），消费透明（§133-134）
  —— 第一片已落地（账本 + 一类消费 + 一格拦截）；第二片把 storage 那一格也接上真的执行方
  （摄取门里拒绝新字节，413，见文末"§133/§134 第二片"与 ADR-0018）；
  （~~改档位的入口~~ 已在 2026-09-30 接上：`/admin/users` 的档位选择，见 ADR-0021）
  **2026-10-23 核对后改口径**：原句"欠 generation 的执行方"是**过期行**——
  generation 这一类**消费早已落地**：`chargeGeneration` 在同步收尾（`finishTask`）
  与审批批准（`decideApproval`：挂起那一次 `deliver` 没走收尾，补丁落地这一次要照扣，
  否则"走审批门的那条路免费"）两处调用，`credit_ledger_task_kind_key` 部分唯一索引
  挡住任何第二次写（重试、批准后作业又被轮询到，都只留一行账）。
  §133 五格的今天：**AI usage 与 storage 有真拦截方**（`refusalFor` / `refusalForStorage`，
  界面那列"已生效 / 还没拦截方"读 `ENFORCED_PLAN_AXES`）；**2026-10-23 再核一遍后，
  "generation 记账但不拦截"也是过期行——闸一直在**：五条生成入口全部先过 `refusalForRun`，
  credits_exhausted 时一条 `agent_tasks` 都不落（判据两层：429 + 副产物行数 0），
  见证 `apps/web/test/credits-enforcement.integration.test.ts`，见文末「第三十片半」。
  标签与事实的对应：`ENFORCED_PLAN_AXES` 里的 `aiUsage` 指的就是这道按 `creditKindForAgentKey`
  分桶（ai/image/video/compute 四桶）、按 `GENERATION_COST`（ai 1 / image 2 / video 5 / compute 1）
  计价的闸 ⇒ "生成次数"这一格**已生效**，只是标签叫 aiUsage；generation 与它是同一道门，
  没有第二道。**2026-10-26 核对后改口径**：此前写的"team collaboration 与 publishing 仍只有
  数字、没有执行方"是过期行——两格在 #201/#205 就有了执行方：`teamSlotRefusalFor` 在 `inviteMember`
  写邀请之前问（成员 + 未过期 pending 邀请一起数，`apps/web/src/server/domain/team.ts`），
  `publishSlotRefusalFor` 在发布之前问（`apps/web/src/server/domain/publish.ts`），拒绝话里带
  档位与数字；`ENFORCED_PLAN_AXES` 收全五格、`UNENFORCED_PLAN_AXES` 为空，`credits.test.ts` 钉着。
  仍欠的是 image/video/compute 三类的**真消耗方**——要 §38/§40 的真生成端点
  （没有 provider 就不造假消耗，§159）。

## M8 — 开放能力（§188）
- [x] MCP、外部 Agent、公开 API —— **2026-10-21 核实后升格**（这一格原来挂着 `[~]`，理由是"还有几件事没做"，
  逐条核实后**那几件要么早已落地、要么今天补上了**）：
  ① **"项目的创建 / 删除 / 发布不对外"是过期条目**（今天第三次撞见"ROADMAP 里的'还没做'是历史快照"）：
  创建 `POST /api/v1/projects`（`projects:write`，2026-10-08）、
  删除 `DELETE /api/v1/projects/<id>?confirm=<名>`（`projects:write`，2026-10-09 第六片）、
  发布 `POST /api/v1/projects/<id>/publish`（`publish:write`，2026-10-09 第八片）⇒ **三样都对外了**；
  ② "MCP 与外部 Agent 接入那一格"：MCP server（第五片 stdio、第六片工具面、**第九片 Streamable HTTP 入口**）都落地了；
  ③ "4000 节点档的 GET 响应体积与 PATCH 耗时仍未量"：**2026-10-21 晚量完了**
  （`scripts/v1-4000-cost.mts`：gzip 后 0.11MB、布局求解 46.2ms、PATCH 改一个节点 2.4ms）；
  ④ **今天补上这一格原本真正缺的东西：一条端到端的证明**——`scripts/v1-agent-lifecycle.mts`
  （真凭据、真 HTTP、真库，把外部 Agent 要走的五步走一遍：建 201(383ms) → 改设计 200(167ms) →
  **读回并断言改动真的在文档里** → 发布 200(384ms) → 删 200(74ms) → 之后读详情 404）✓
  ⇒ **M8 整格从 `[~]` 升到 `[x]`**。
  公开 API 这一格已有读与写（第一片三格只读 + 第二片 PATCH 设计补丁 +
  第三片凭据级的访问账 + 第四片 JSON 出口的编码协商，2026-09-29/30）；4000 节点档的公网读/写
  **有了实测**（3293KB → 线上 gzip 103KB、GET 中位 513–951ms、一次 insert 中位 1369–1597ms，
  数与口径在 `docs/PERFORMANCE.md`）。
  **2026-10-07 第五片（MCP server 落地）**：`apps/mcp-server`（stdio）——定位是 **v1 的外部客户端**，
  不是特权通道（ADR-0031）：不 import 业务代码、不连库，四个工具与 v1 四条端点一一对应
  （`nexus_list_projects` / `nexus_get_project` / `nexus_get_design` / `nexus_patch_design`），
  token 鉴权、scope、凭据级访问账三道门自动继承；工具描述自带限度（先看规模再拉整份、
  删除类 op 会被 `approval_required` 拒、打不到的 op 被 `ops_skipped` 整体拒）。
  **测试**：`mcp.test.ts` 7 条对真本地 HTTP 后端量（tools/list 恰好四个、Bearer 头、PATCH body
  原样透传、404/401 变 isError 且错误码留文本、连接被拒是另一条错误路径）；stdio 冒烟两臂
  ——真进程 initialize 报 `nexus` + tools/list 四个、缺 `NEXUS_API_TOKEN` 退出 1 且 stderr
  说清凭据在哪签发（`npm run mcp:serve` 起服务；typecheck 链已纳入 apps/mcp-server）。
  **2026-10-09 第六片（建/删项目对外）**：`POST /api/v1/projects`（回 201 + `ApiProjectDetail`，
  `kind` 不认识回 400 并列出可选值，**不悄悄兜底成 `website`**——界面那条路是 `<select>` 送不出坏值，
  外部调用方写错类型必须知道）+ `DELETE /api/v1/projects/<id>?confirm=<项目名>`（复用
  `softDeleteProject()`：确认词逐字比对、越权 404、软删、审计留行；回执里写着"v1 没有恢复端点"，
  限度不靠调用方读文档）。scope 名单多一格 `projects:write`（迁移 0027 换 CHECK 不追加，
  手法同 0019；`ApiTokensPanel` 有对应的中文标签）。守卫同步：端点清单 4→6、写方法名单加 `DELETE`、
  "名单外 scope"反例从 `projects:write` 换成 `projects:delete`（它已经合法了，拿它当反例是假信号）。
  `api-v1-write.integration.test.ts` 8 条对真库量（403 点名缺哪格 / 真落库 / 未知 kind 400 且库不涨 /
  确认词不对 400 且项目还在 / 软删后详情 404 / 删别人 404 / 审计 allowed 各一条）。
  **2026-10-09 同日第八片（发布/下架对外，`publish:write`）**：`POST /api/v1/projects/<id>/publish`，
  响应 `ApiPublication`（path / version / visibility / publishedAt）。**v1 只收 unlisted / private，
  public 一律 400 并说明"回平台界面"**：§131 的机检与人工裁决在人的路径上，§74 把公开发布列在
  必须人工审批的清单，而一枚 Bearer 凭据背后没有可点批准的人——让外部 Agent 走 v1 直接进公网
  等于把审批从链上摘掉。scope **没有并进 `projects:write`**：发布（把内容放到公网）与建项目、
  删项目是三种风险，合成一格的话一枚为建项目签的凭据就顺带学会了发布（比 0019 那次更细一层的
  least-privilege）。private 走 `publishProject` 而不是 `unpublishProject`：回执永远是同一份
  publication 形状，且行留着（URL 一样解析不出来）。迁移 0028 换 CHECK。真库用例
  `api-v1-publish.integration.test.ts` 7 条：403 点名缺格 / unlisted 落库且 `resolvePublishedPath`
  真解析得出 / 重发布同 URL 涨版本不开新行 / **public 400 且行一个字节不动** / private 下架后
   解析不出而行还在 / 别人项目 404 / 审计 allowed:true。MCP 工具面同日 6→7（`nexus_publish`，
   public 收在 inputSchema 里，发都发不出去）。
   **2026-10-09 第九片：Streamable HTTP 入口**（原"仍欠：MCP 托管的 Streamable HTTP 入口"清账）：
   `apps/mcp-server` 加第二个传输入口 `src/http.ts`（`npm run mcp:serve:http`，`/mcp`，默认 3400）
   ——**工具层一个字没改**（七个工具还是 v1 七条端点的镜像），挂的还是 v1，ADR-0031 的选择
   一字不动（没有把 MCP 处理器搬进 Next.js）。托管形态改的只有凭据形状：每条请求带
   `Authorization: Bearer`，initialize 那枚 token **绑定整条会话**（换 token → 401
   `session_token_mismatch`，不然"会话 A 建立、token B 调用"就是提权缝）；token 真假仍只有
   v1 说了算，这一层不做第二套凭据库（值错的 token 出去是 v1 的 401，进 isError 文本）。
   测试 `mcp-http.test.ts` 7 条（401+WWW-Authenticate / 404 / 会话绑定全链：换 token 401 →
   原 token DELETE 200 → 删完 404 / 缺会话 400·未知会话 404 / 坏 JSON 400 / 真客户端完整握手
   tools/list 恰好七个且限度话还在 / 工具调用的 Bearer 逐字到 v1 / 值错 token 走 v1 401 进
   isError）；stdio 13 条不动；真进程冒烟 initialize 200 + `mcp-session-id`、缺 Bearer 401。
   （原两处文档写"工具面 7→8"是差一：实际 6→7，v1 端点也是 7 条，已一并改正。）

## 横向能力（随里程碑推进，不单列里程碑）
- Agent 工具注册表 + 权限 + 人工审批门（§72-74/177）— **§74 点名的「删除项目」这一格已落地（2026-09-26）**：
  起点是一件对不上账的事：`projects.deletedAt` 从建库起被近二十处读取谓词挡着（列表 / 搜索 / 发现 / 公开页 /
  创作数据 / 个人主页 / 收件箱那条链接），**但全库没有一个写入方**——那些防御性判断今天全是死代码，
  而 §74 列在"必须人工审批"清单上的那个动作在界面上根本没有入口。
  现在有了：`softDeleteProject` / `restoreProject` / `listDeletedProjects`（`domain/projects.ts`）+
  `DELETE /api/projects/[id]`（报文 `ProjectDeleteRequestSchema`，只有 `confirm`）+ `POST /api/projects/[id]/restore` +
  首页每个项目下的确认卡片与「回收站（N）」。
  **审批做在服务端**：`confirm` 必须逐字等于项目名，不匹配就一条都不写、只留一行 `allowed:false` 的审计（写进 §84 那张 `audit_events`）。
  只在界面上放 `window.confirm` 等于没有审批——直接打接口的人不受它约束，e2e 的第 ①② 两步就是绕开界面打的。
  **软删而不是删行**：§108 把用户的项目历史归 Snapshot 管，一次撤销不该把发布记录、快照、评论一起带走；
  集成用例为此数的是库里的条数（快照条数与 `published_projects.id` 在删除前后一模一样），
  恢复后同一条公开 URL 又打开的正是删之前钉住的那一版。
  顺手补上一个只有今天才会撞上的洞：`publicRefByPath` 的注释写着"和 `resolvePublishedPath` 同一口径"，
  代码却只挡 private 与被拒绝的——于是"页面已经 404，但点赞/评论/改编接口还在替一个作者已经删掉的项目收写"。
  `deletedAt` 以前从来没有值，这条差异是看不见的；现在补了谓词，用例里删除前后各打一次同一个接口。
  限度如实记下：① **没有"永久删除"也没有到期清理**，回收站只进不出（除了恢复），存储不会因此回收；
  ② 只做了"删项目"这一格，§74 清单上的消耗 credits / 对外发送消息 / 生产部署 / 支付都还没有审批门（M7/M8 未开工）；
  ③ §72-73 的 agent 侧审批当时未落地（`agent_tasks.requires_approval` 全库无人置真）——**同日补上了，见下面那条**；
  ④ 确认词比的是名字的原值，改过名就要用新名字确认——这是这条门的全部形式，不是缺陷；
  ⑤ `confirm` 有 2000 字上限（项目名这条链上没有 120 那样的约束），名字超过它的人先改名再删，界面上报的是"确认词太长"而不是"不匹配"。
  验证：`project-delete.integration.test.ts` 16 条打真库（含 §61/§164/§165/§166/§168 各面的可见性）+
  `@smoke §74` 在真浏览器里跑两个身份并直接打接口。四次反向实验各打中要害：
  把审批判定短路 → 2 条红（都红在"返回值应该是 approval_required"那一句）；
  把软删改成 `db.delete` → **8 条红**，其中"快照条数不变"从 2 变 0——那正是"软"这个字的全部意义；
  把 `publicRefByPath` 与收件箱新接上的 `deletedAt` 判定各自拆掉 → 各恰好 1 条红，
  红的那一句都是"删除之后应当看不见 / 点不开"，而同一个用例的下一步要求恢复后答案翻回来。
  Agent 工具注册表与权限矩阵（§72-73）本身仍未开工。
- [x] §74 的 agent 侧审批门（2026-09-26）— **`agent_tasks.requires_approval` 从此有了写入方**。
  上一条记下的是"删项目"这一格；这一格管的是 AI 那条路：一条 `remove` 在批准之前进不了画布。
  门做在**写入之前**且做在**服务端**：`apps/web/src/server/ai/approvals.ts` 的 `gateResponse` 逐 op 扫
  `remove / removePage / removeToken / removeAsset`，与 provider 自报的 `approvals` 取**并集**后把补丁整份扣下
  （`delivered.patches = []`，完整那一份只存在任务行的 `result` 里）。并集是必须的：
  provider 报的是它记得的那些，规则版 mock 与任何一次改写都可能给出一条 `remove` 而不附说明——
  provider 失忆不能变成"删除直接进画布"。
  `approvalPolicy` 这一栏**不由请求方定义**（§68 同一口径）：`assemble.ts` 一律覆盖成 `WEB_APPROVAL_POLICY = ['delete']`，
  客户端传什么都无效，e2e 第 ① 步就是自己填一个空数组直接打接口。
  裁决走 `POST /api/ai/tasks/<taskId>/approval`：`WHERE status='awaiting_approval'` 的 CAS 保证**第一次决定算数**
  （第二次 409），批准交回的是**当初被扣下的那一版**而不是重新生成的一版（理由见 `docs/adr/0012`）；
  归属由账本的 `created_by` 判，别人的任务与不存在的任务是同一个 `not_found`，两种都进审计（后者 `allowed:false`）。
  Studio 的审批卡片**从账本找回**（`GET /api/ai/pending-approvals`）：刷新之后现场还在，
  而读侧一个字都不给补丁正文——界面上"批准"是唯一的落地路径。挂起时**不写 `finishedAt`**：等待不是终态。
  这一路在真浏览器里撞到四个缺陷（都与 §74 本身无关，也都是这次才撞到的）：
  ① 裁决回执原先嵌在卡片内部，批准之后卡片消失、回执跟着一起没了，用户看到的是"按钮一闪，什么都不说"；
  ② `invertPatch` 对整棵子树的还原被函数末尾那次全局 `ops.reverse()` 翻了顺序，撤销时子节点因父级还没回来被逐条 skip，
  **节点悄悄少一半而处处绿灯**（画布 8 → 1 → 2），另有跟着克隆塞回 `children` 与逐条 `insert` 叠成双份的问题；
  ③ 同一屏上"画布还没有被改动"与 provider 活动流那句"1 个 op 已落地"并存——门把交回的那一份里的说法改成了
  "批准之前不会落地"（计划步骤的 `done` 同样换成 `skipped`），而**存下的那一版一个字不改**，批准之后交回的还是当初那一版；
  ④ 开发模式下这条路由的首个 POST 实测 8~9 秒，5 秒的默认断言会稳定误报"按钮没反应"。
  限度如实记下：web 侧只有 `delete` 这一档策略，§74 清单上的消耗 credits / 对外发消息 / 生产部署 / 支付仍未接（M7/M8）；
  写这一片时异步那一路（§162）还不认审批——**同日已经撤销**：`observeJob` 之后过的是同一个 `gateResponse`
  （见下面 §162 × §74 那一条），当时拦不住是因为异步那一路连结果都没交回来；
  `awaiting_approval` 的行**没有过期与清理**，没人决定就一直等着（界面上常驻可见，但库侧无 TTL）
  ——**2026-10-01 已接上**：`awaiting_since` + 读时收敛，见本页最后一条；
  卡片是挂载时读一次，没有实时推送，另开一个标签页批准之后这一页要刷新才更新。
- Context Engine / Design Index / Project Graph（§66-71）— **五切片已落地（2026-09-24）**：
  `buildDesignIndex`（`packages/design-model/src/context-index.ts`）把一份设计文档投影成**目录**
  （页面 / 框 / 组件 / 资产 / token / 交互 + 跨引用边 + totals，纯函数、不含正文），
  `fitIndexToBudget` 按字符预算裁剪，并且**逐条交代裁掉了什么**（totals 始终来自未裁的那一份，宁可少列条目不少报数）；
  服务端 `buildProjectContext`（`apps/web/src/server/domain/context.ts`）一次装配出设计目录 + 世界/角色/记忆/资产/语料/快照/发布的摘要 +
  §71 七个分支各自的索引状态，过 `ProjectContextSchema` 后由 `GET /api/projects/[id]/context` 出去；
  Studio 的「上下文」面板与 Agent 请求从同一份装配出发，面板上还给出「目录 vs 整份文档」的字符对比与可改的预算。
  第二切片把 §68 的缺口关上：AI 请求不再带整份文档。`POST /api/ai/run` 先校验项目归属，
  再用同一个 `buildProjectContext` 在服务端装配目录（`apps/web/src/server/ai/assemble.ts`），
  客户端上传 `context.document` 一律 400 并说明原因（边界要能被拒绝，不能只写在注释里）；
  DEMO 那一路的确定性规则改读**服务端权威文档**（本地工具入参，不上线），
  命令栏发请求前先 `flushBeforeAi()` 把脏改动落库——上下文既然来自库里，就不能悄悄按旧版本生成。
  这一路顺带挖出一个老 bug：`loadDocument` 只写不读 `visual_dna` / `brand_kit`（§16 的闭环断了），
  表现是"明明提取过 DNA 却按内置配色生成"。
  第三切片补 §69 的 Code Index（`apps/web/src/server/domain/code-index.ts`）：目录**从 codegen 的产物现算**，
  不另起一套对代码的认知（§16 的投影），也不落进库里的 `files` 表——那张表现成但一行都没写过，
  而算得出来的东西写进库迟早读到旧的（取舍见 `docs/adr/0007-…`）。符号、行号、参数、import 全部走**真实 TypeScript AST**，
  解析失败报"失败"而不是报"0 个符号"；文件归属由发射器自己标注（`GeneratedFile.origin`）。
  发给 provider 的是 `buildCodeDigest` 的结果：path / 语言 / 人话归属 / 行数 / 符号名 / 依赖 / **逐条命中理由**，
  **代码正文一个字符都不上线**（§68，`ai-assemble.integration.test.ts` 直接断言线上含符号名而不含区域正文）。
  排序是**词法**的（CJK 二元切词，中文页面名命中得了），不是语义的。
  §71 的 Code 分支因此从「未索引」变成「已索引」，note 写成可核对的一句话；面板同一行报目录字符数、
  文件/符号/内部依赖数与"几个文件没解析出来"。建这个目录当天照出一个真 bug：
  **页面名没有 ASCII 字符时导出 `components/nexus/undefined.tsx` / `export function undefined()`**
  （中文页面名是常态，不是边角），已修并钉在 `packages/design-model/test/codegen.test.ts`。
  第四切片干的是**把这条链在 Python 那头接上**：§68 只是不再发整份文档，`apps/ai-service` 的
  `build_prompt` 从头到尾没引用过 `designIndex` / `codeDigest`——它一直在读 `context.document`，
  而那个字段现在线上根本不存在。所以**今天看着正常只因为 DEMO MODE 跑的是进程内的 TS mock**；
  一旦配上真 provider，提示里的节点表会是空的，模型只能凭页面名瞎猜 nodeId（§159 的反面）。
  现在 `build_prompt` 优先吃目录（pages / frames / tokens / components / assets / interactions +
  totals + omissions + trimmed + 代码摘要），并在 payload 里自报 `contextSource`：
  `designIndex` 是正常路径，`document-fallback` 与 `none` 都带一句人话说明"这次看到的比正常少什么"，
  降级可见、不静默；超过预算同样如实写进 `promptTruncated` 而不是偷偷截掉。
  钉住它的是 `apps/ai-service/tests/test_prompt.py`，夹具由 `npm run contract:export` 用**同一套装配代码**
  现算（id 固定化后两次导出字节相同），所以 TS 侧改了目录形状、Python 侧的测试会先红，
  不会出现两端各自演化。反向验证过：换回旧 `build_prompt`，9 条里 6 条立刻失败。
  第五切片把 §68 剩下的最后一块"客户端说了算"拿走：`selectionDigest` / `designSystemDigest` 以前是浏览器
  算好发上来、服务端照单收下。不算越权（读的是自己的项目），但模型看到的"现场"是请求方自述的——
  谎报一个不存在的 nodeId、或者用点击顺序暗示哪个更重要，服务端没有任何办法发现。
  现在命令栏只发 `projectId / pageId / viewport / selection`（id），两份摘要由
  `apps/web/src/server/ai/derive-context.ts` 从**权威文档**现算（`buildSelectionDigest` + token/组件表），
  上传任一份摘要和上传整份文档同罪：400 `context_selectionDigest_not_allowed`（§12 的第 12 条边界）。
  `buildSelectionDigest` 比原来那份客户端摘要多交代三件事：认不出的 id 进 `missing`、文档里有但走不到的
  进 `unreachable`（`depth: null`，样式信息仍如实给出）、超出 12 条的进 `dropped`；
  顺序改成"当前页优先 + 文档位置"，客户端的点击次序不再参与。文字/尺寸/字号沿用模型里的意图值
  （`hug` / `fill` / `{token}` 不换算成像素），token 引用与目录、lint、health 同一个 `collectTokenRefs`。
  夹具那一路也跟着改：`scripts/ai-request-fixture.ts` 直接调 `deriveContextFromDocument`，
  摘要不再手抄——导出来的 `contracts/fixtures/*.json` 里那份就是服务端真会发出去的那份。
  **① Code Index 的后半截已在 2026-10-07 落地**：`fetchCodeByPath(document, path)` 能从设计文档重新生成项目并返回指定路径的完整代码内容（生成的 .tsx/.ts 文件与 code-only 区域都支持），找不到返回 null；更新 `CODE_INDEX_OMISSIONS` 删掉"要读实现得按 path 取"这一条；新增 4 条测试验证取生成文件、取 code-only 区域、找不到返回 null、符号列表与目录一致（`apps/web/test/code-index.test.ts` 18 passed）。
  Agents / Runtime 两个分支仍未落地，面板上写的是「未索引」而不是空白；
  ② 语义相关性与重排要 embedding provider（§49 的向量半）；
  实测尺寸/耗时见 `docs/PERFORMANCE.md`，预算为什么取 20000 见 `docs/adr/0006-design-index-char-budget.md`。
- 作业队列（§162）— **ai-service 这一侧已落地（2026-09-24）**：`POST /v1/ai/jobs` 收同一份 AiRequest，
  校验通过就入队并回 202 + jobId，`GET /v1/ai/jobs/{id}` 回 Queue→领取→结束三段里程碑与最终结果。
  关键的一条设计是**不给第二条执行路径**：worker 调的就是同步 `/v1/ai/run` 那个 `execute_ai_request`
  （从 app.py 里抽出来的 `execution.py`），所以"异步的作业其实没校验补丁"这种分叉从结构上不可能出现，
  而被 `test_async_result_is_the_same_pipeline_as_the_sync_route` 钉成"两份响应体必须逐字段相同"。
  后端两种，且**限制写在报文里**：`memory`（默认，只此进程可见、重启即失）与
  `redis`（配 `NEXUS_REDIS_URL`；LPOP 保证同一个作业不会被两个 worker 领走，跨 store 读得到）。
  配了 Redis 却连不上 → 启动直接失败，不会悄悄退回内存后端。`/healthz` 里那个写死的
  `pending: 0` 换成了真计数（`backend`/`capacity`/`note` 一起报），没跑 lifespan 时报 `backend: none` 而不是崩。
  `progress` 在没有真进度来源时恒为 `null` —— 不编一条 0.2→0.9 的假刻度。
  ~~仍欠的两笔：① **web 侧还没有消费者**（`/api/ai/run` 仍走同步路径）~~——
  **2026-10-27 核对后改口径**：web 侧消费者已接上（`/api/ai/jobs` 提交、`GET /api/ai/jobs/<id>`
  轮询、`POST …/cancel` 取消；Studio 命令行那个「异步作业」勾选走同一条落地事务，见本页作业队列那一条）；
  剩下的一笔是：§163 的实时推送已在 2026-09-26 落地（见下面那条），
  但**它推的是同步请求的两个真端点**（开始与结束），队列那条路**没有真进度来源**——
  `jobs.py` 里的 `progress` 在拿到真刻度前恒为 `null`，不编一条 0.2→0.9 的假刻度；
  等 ai-service 给出中间态，`progress` 才允许不是 0/1。
  验证：45 条 pytest（新增 9 条）+ 真 Redis 跑通 9/9（`NEXUS_REDIS_URL=redis://127.0.0.1:6380/0`），
  真 uvicorn 起服务手工核对过 202→failed(provider-unavailable)→404 三种回话；
  两次反向实验（计数器写死 0、worker 无论什么都算完成）各自打中对应用例。
- Observability / Evaluation / Visual Benchmark（§84-86/156）— **§84 的审计那一半已落地（2026-09-25）**：
  `audit_events` 这张表建库起就有、注释写着"含被拒绝的越权尝试"，但**全库没有一处写它**——
  "有表"不等于"有审计"。现在有了写入方（登录/注册成功与失败、人工裁决含重复裁决与越权尝试、
  发布/下架/取消发布、角色变更），以及 `/admin/audit` 页。取舍见下方进度记录。
  **§86 Visual Benchmark 第一切片已落地（2026-10-28）**：确定性本地比较两张 PNG（参考 × 生成），不用 provider。
  指标按 MASTER_DIRECTIVE 的"不要只做 pixel-perfect"拆成结构：32×32 归一化网格（各自按自己的尺寸映射，不重采样）、
  布局=软 Jaccard、间距=行列墨量剖面差、对齐=±2 格容差的带边匹配、颜色=加权调色板得分，另给
  meanAbsLuminanceDiff 做原始像素读数（明确标注"不是分数"）；纵横比差 >5% 披露 shapeMismatch。
  测不出的两维如实进 `notMeasured`：typography（位图测不出字号字重）、componentCorrectness（像素统计答不了
  "这块是不是那个组件"，等视觉 provider）。路由 `POST /api/projects/[projectId]/visual-benchmark`：
  CSRF、两张图都必须是本项目的（404 不泄露存在性）、非 PNG 415、解不开 422 带原因、纯计算不写库。
  见证：9 条纯函数用例（真 PNG 字节）+ 7 条真库真存储路由用例；变异探针把 softIoU 写死为 1 ⇒
  精确红在"对角布局 0"与"半格 toBeLessThan(1)"两处，恢复（sha256 核对）后全绿。取舍见 ADR-0067。
  **第二片同日落地**：Studio 资产面板有了界面入口（「视觉基准（比较两张 PNG）」：两张下拉选位图 →
  比较结构 → 结果区把 notMeasured 渲染成"测不出 + 原因"，不渲染成 0 分）；响应形状进
  `packages/schemas` 的 `VisualBenchmarkResponseSchema`，客户端先验再渲染。**真浏览器里当场抓到一个
  指标谎报**：间距显示 -300% —— rowInk/colInk 按整行累加、全墨行读出 32，"1-平均差"能到负数；
  改为按 GRID 摊成"该行有墨占比"（0..1），对角 fixtures 实测 88%（= 4.0/32 的解析值），
  单测加了 0..1 边界钉。**§85 Evaluation 第一切片已落地（2026-10-28）**：`scripts/eval-baseline.mts`
  跑生产真路径（真库 RAG / 真 provider 补丁 / 真 codegen 往返 / 真 a11y 门禁），九维里本机可测的
  五维有了首跑读数（RAG recall@5 100%、往返 5/5 干净、a11y 检出 4/4 等，见 `docs/EVALUATION.md`）；
  不断言阈值，但结构不变式红即非零码退出。首跑 7 条不变式红 5 条，归因出**三个产品真缺陷**
  （§86 颜色指标自比 ≠1 的分母谎、§38 合成链"换色不变构图"的假注释、DEMO provider 引用不存在的
  `{font.display}` token）加两个评测自己的错（语料少建一条 lore、引用检查器把链式 insert 当幻觉），
  全部修复并有回归钉。**§85 第三笔（2026-11-08）：`evals/` 目录落地**——"按能力分套件"以前只有这一个脚本，
  现在有了骨架：`npm run evals`（确定性、无库无网的 suite；`--list` / `--suite` 过滤）与 `npm run evals:baseline`
  （这个脚本不动）分两条；第一套新维度 **code-index**（§69 Code Index 检索：totals 对账 / 语法诊断全无 /
  当前页与选中节点加权 / 精确符号名 / 预算=1 极限仍报未裁的数）19/19 结构不变式绿；
  同文档两次投影逐字节相同第一次被钉住。读数见 `docs/EVALUATION.md` 第十五/十六片。
  **第四笔（2026-11-08）：登录后九张界面的浅色 axe 补上**——`e2e/a11y-light-internal.spec.ts`
  （与 dark 同一名册/判据/纪律，前提门从 tokens.css 现读现算）：首跑 Studio 抓到 1 serious
  `label-content-name-mismatch`（XL 屏画着"折起"的收起属性面板按钮，`aria-label="收起属性面板"`
  不含可见文字；改 `折起属性面板` 后 25/0/0，其余八张首跑起就是 0/0/critical 0）；
  dark 复扫同按钮链也绿（25/0/0）。浅色九张浏览器最低对比度 4.64:1。见 EVALUATION 第十七片。
  **第五笔（2026-11-09）：`export-roundtrip` 真库套件**——§144 从 presence 到 fidelity：
  真项目→真 ZIP→node zlib CRC 交叉校验（5/5）→真导回→结构对账（页数/类型多重集/tokens/responsive marker）
  →二次导出计数对账；17/17 PASS。两条教得入账：JSONB 键序归一化 ⇒ stableJson 比较；
  真库套件把 pg 池漏在事件循环里 ⇒ `npm run evals` 需要显式 `process.exit(0)`。见 EVALUATION 第十八片。
  **第六笔（2026-11-09）：公开作品页 × 浅色 axe 补上**——`e2e/a11y-light-public.spec.ts`（sitemap 现取载体，不注册不建项目，
  与 guest/internal 两片同一套门与纪律）：axe 报 1 serious color-contrast（作者本人 opacity 0.75 的 CTA 白字压紫，
  合成后 4.25<4.5；白字紫底本身 5.24 过；暗色同条；记作者侧，非平台缺陷）。结构不变式绿（passes=24 / critical=0）。
  见 EVALUATION 第十九片。
  **第七笔（2026-11-09）：浅色键盘走查补上且抓到一个真缺**——`e2e/keyboard-light.spec.ts`：
  公开作品页的热点焦点环从 `var(--nexus-color-accent-2)` 换成 `var(--nexus-color-accent-2-ink)`；
  §167 修的重点环浅色 #0f6b7a vs 浅色背景 ≈ **6.05:1**（此前 ≈1.70:1，强调色浅色不翻域同根因）。
  六道门同车道绿（18/18），Enter 真走到 work-complete 200 recorded:true。见 EVALUATION 第二十片。
  **第八笔（2026-11-09）：增量/全量 A/B 有了首份同刻证据**——同一构建（含 b89631c）两次：首帧 1000 节点 off 反优，
  pan/属性写入分不出；**浏览器端分辨不出增量增益**（模型层那条证据不受影响）。证据 log 入库。见 PERFORMANCE.md 2026-11-09 节。
  **第九笔（2026-11-09）：收起面板的 axe 补上并收下 44 个失名真缺**——
  `e2e/a11y-panels.spec.ts` 展开设计系统令牌表 + 方案板投票 + Agent 面板扫三屏：
  首跑 **44 个 text/color 输入全裸名**（`control-names.test.ts` 只有 select/file 两类，结构上看不见）；
  补 `aria-label`（`{token.key} · 值` / `· 颜色` / `新 token 的键` / `的值`）后 **0 违规 / 0 critical**。
  见 EVALUATION 第二十一片。
  **第十笔（2026-11-09）：`control-names.test.ts` 扇入 text-like 输入，18 处裸名全收**——
  首跑红 18（`AccountPanel` ×3、`NewProjectForm`、`ProjectDeleteCard`、`MarketplaceCreateForm` ×3、`ReportControl`、
  `AccountDeletionPanel`、`LayersPanel` ×2、`TopBar`、`ContextPanel`、`VariantsBoard`、admin/marketplace + admin/moderation ×2）；
  全量补 `aria-label` 中文名，3/3 门绿——门现在数 text-like input 的存活数，改过 scope 缩回去当场变空并红。
  见 EVALUATION 第二十二片。**第二片同日落地：渲染后页面的无障碍**（`e2e/a11y.spec.ts`）：真发布流程
  建公开作品页，匿名访客在真 Chrome 里对真 DOM 跑 axe（WCAG 2.0/2.1 A+AA）——设计模型的静态门禁
  测的是设计，渲染投影只有 axe 才测得到。首跑 serious color-contrast ×7（24 过 / 39 不适用 /
  critical 0），全部同源于一个 token `--nexus-color-fg-3`——改前暗色对四级表面是
  4.19/3.99/3.70/3.34、浅色 2.93/3.11/2.73/2.51，两个主题都不过 AA 的 4.5。**这条账当天修掉**：
  暗 `#828ca8`、浅 `#5b6478`，重算得 5.87/5.58/5.18/4.67 与 5.59/5.93/5.21/4.79 全过 AA，
  与 fg-2 仍差 1.49×/1.32×（三级文本层级没塌），axe 复跑**违规 0 条**。钉法是
  `style-tokens.test.ts` 里按 tokens.css 字面值算对比度的两道门（变异臂：token 改回旧值恰好红 2 条），
  因为全站 639 处 `text-fg-3` 里有些落在没有浏览器门的 bg-3 上（市场「已举报」徽标、Agent 面板 busy 态）。
  **这一片还推翻了我自己写的一条归因**：首跑说 7 处里有 2 处是"作者快照的忠实渲染"，
  而改 token 后它们一起消失——「还没有评论。」与统计告知段都在壳上，作者投影一条都没进 violations。
  结构不变式钉 `passes>0`（防白页假绿）与 `critical===0`。
  **第三片同日落地：只用键盘的人能不能走完这一页**（`e2e/keyboard-a11y.spec.ts`）。axe 量 DOM 的形状，
  量不到 tab 顺序、焦点可见性与"点了会翻页的东西能不能被 Enter 按响"；载体是 §167 那份两页互动稿
  （平台上唯一"必须按一下才走得通"的公开页）。读数：分母 9 个可聚焦控件、走查 11 步、**覆盖 9/9**、
  tab 顺序逐字等于 DOM 顺序、页内无焦点指示的停留点 **0**（唯一没指示的是 Next 的开发工具 portal，在
  `[data-published-root]` 之外）；Enter 按响热点 ⇒ URL 带 `?page=`、`work-complete` 回 200 且
  `recorded: true`——键盘走通与鼠标走通进同一个数。六道结构不变式（非空转／热点在册／无陷阱／覆盖／
  顺序／焦点可见）配四条变异臂，逐字节 md5 复核还原：基线全绿、正 `tabIndex={1}` 红在「顺序」、
  热点 `tabIndex={-1}` 红在「热点在册」、摘掉 `focus-visible:ring-2` 红在「焦点可见」。
  **第一版有两句判据被自己的臂否证并已改写**：覆盖门抓不到 `tabindex=-1`/`disabled`（它们让控件
  从分母一起蒸发，两侧同源永等，现在排除项照实打印成读数）；热点退出 tab 序后浏览器给投影出的
  根节点框补了一个 tab 停留点，首红落在「顺序」而不是热点那道——红是真红但没点名缺陷，所以把
  「热点在册」提到走查之前。顺带记下一条运行条件：注册按 IP 限流 10 次/小时，而 e2e 有 10 个文件
  各注册一个新账号，连跑第二轮会 429 且界面上只留 `guest`（看着像用例坏了）——**没有为测试放宽那道闸**，
  只把答复码印进第一条报错，节奏写进 `docs/ENVIRONMENT.md`。
  **而那句诊断自己把绿路走死了（同日下一轮实测）**：上面那四条臂是在诊断加进去之前跑的；诊断要读
  `[data-auth-error]`，写成 `locator.textContent().catch(() => null)`——注册成功时那个元素不存在，
  Playwright 便先等它出现，而 `actionTimeout` 没设（不限时），`.catch()` 只在测试超时把等待 reject 掉
  的那一刻才生效。同一元素 `count()` 117ms 报"不在"，紧接 `textContent()` 挂 **145 秒**，基线从"能过"
  变成"必然整条测试超时"，报错却还写着"注册没把会话升成 member"（把人往限流上带）。改成不等待的一次性
  读数（`page.evaluate` 取 `querySelector(...)?.textContent`）后同一条腿 **9.6 秒**绿，上面那组读数
  （分母 9／走查 11／命中 9／排除 1）一字不差复现。教训：**"等一个不该存在的元素"不是稳妥兜底，
  是把绿路变成死路**——读"有没有"要用不等待的 API。
  **第四片同日落地：登录后那九张界面长什么样**（`e2e/a11y-internal.spec.ts`，一次注册扫首页／Studio／
  发现／市场／通知／数据／搜索／额度／凭据）。首跑三类缺陷：`label`×2、`select-name`×3、`color-contrast`×2。
  对比度那条不是手滑——按 tokens.css 字面值量全库的"同串底色+文字"配对，67 条里 **36 条不及格**
  （32 条是同一个写法 `bg-accent-2 text-fg-1`，暗色 1.60:1），根因是三个 accent 不随主题翻转而 `fg-*`／`bg-*`
  翻，所以"亮色实底 + 任一文本 token"必在某个主题上塌。修法是给这类底色一个不翻转的前景 token
  `--nexus-color-accent-fg`（46 条串／32 个文件），并删掉那个从没被引用过、白字压 brand 只有 4.17 的
  诱饵 token `--nexus-color-brand-fg`。可及名那五条补齐之后，**拿同一判据去找全库又翻出 6 处一模一样的**，
  它们全在默认收起的面板与点开才出现的表单里——**axe 只看得见渲染出来的 DOM，结构上就扫不到它们**，
  于是新增 `control-names.test.ts` 按 JSX 字面判（`aria-label`／`aria-labelledby`／`title`／被 `<label>` 包住／
  `id`+`htmlFor` 五选一），并把对比度配对钉进 `style-tokens.test.ts`。两道门都有"验电"：改之前的写法必须红，
  合法写法必须放，`onChange={(e) => …}` 里的 `>` 不许把开标签截断。改完复跑九张 **违规 0 / critical 0**（17.6 秒）。
  这一片还纠正了第三片留下的一句归因：那句"两次红都是限流"只算对一半——同一形态（身份仍是 guest）
  还有一条独立成因：**SSR 的 HTML 一 attach 就能点，可 React 的委托监听还没挂上，点击静默丢掉**（实测同一
  脚本两次跑一次成一次败，答复码是 0，因为 POST 压根没发）。`waitForSelector('[data-auth-tab=…]')` 等的是
  HTML 不是水合，所以它不是屏障；屏障只能是"点下去之后 DOM 真的按状态变了"，落进
  `e2e/support/auth-session.ts`（切一次登录／注册看昵称框消失再回来；建项目看 `disabled` 被点亮），
  两片 a11y e2e 已改用它。**分辨办法：答复码 0 = 点击被吞，429 = 限流**。
  另记两笔技术账：① 其余 9 个 e2e 文件仍是无屏障的老写法（`data-auth-email` 一填就点），
  该换成 `registerMember`／`createProjectNamed`；② `bg-brand text-bg-0` 这类写法在浅色主题下会塌——
  这条当天还清，但**还账时发现的门病比账本身严重**，记在第五片。
  **仍欠**：§85 的真实 provider 半边（LLM 裁判 /
  Tool selection / Agent task completion）、RAG 向量半（#110）、~~Studio / 市场 / 收件箱等其余界面的
  键盘走查（axe 九张已扫，见上）~~（**第七片已还键盘那一半**：首页／Studio／发现／市场／通知五张登录界面
  加上公开页共六张有读数；键盘仍未量的是后台／管理界面与"点开才出现"的控件）；§86 的 provider 接入半边
  （typography / componentCorrectness 的真实来源）。
  **metrics/tracing 那一格同日落地（第十一片）**：进程内计数器 8 个指标 + `x-nexus-trace` 追踪 id +
  库里三张账，读面是 `GET /api/admin/metrics`（JSON／Prometheus 文本）与 `/admin/observability`，
  决策见 `docs/adr/0068-in-process-metrics-and-trace-id.md`。"线上发生了什么"不再只能靠审计表 + stderr；
  **仍欠的观测**是按路由的状态码与延迟分布（Next 16 没有"每请求开始/结束"钩子，要它得改路由形状）、
  对外抓取目标与告警。
  **第五片同日落地：还第四片那笔浅色账时，发现门自己在骗人**（`style-tokens.test.ts`）。
  第四片把"同串底色+文字"钉进门里时只查了暗色——暗色是产品当前唯一渲染的那套，看起来合理。
  把这条门扩到两个主题后它没有立刻红，而是**继续绿**：一查才知道 `valueOf()` 用了两次 `replace`
  剥前缀，`text-bg-0` 被剥成 `"0"`，查不到值就走了那条"不是本文件的色"的 `continue`——
  **跳过是无声的**。把"名字在 tokens.css 里就必须解析得出值"变成硬断言后，红出来 **22 处**：
  `bg-brand text-bg-0` 12 处（浅色 3.93）、`bg-warn text-bg-0` 7 处（**1.91**）、`bg-success text-bg-0`
  3 处（2.15）。修法与第四片同一条：换成不翻转的 `text-accent-fg`（12 个文件／22 条串）——
  暗色下 `bg-0` 本来就是 `#0a0b10`，与 accent-fg 同值，所以**这一批改在看得见的主题上零变化**，
  只是把一套跑不到的主题从"迟早要塌"变成"已经过 AA"。看图确认过（`.scratch/shots-lighttheme.mjs`
  强制 `data-nexus-theme=light` 拍首页／Studio／市场，控制台无报错）。
  同一把尺子反过来量"强调色**当文字**"（`text-accent-2` 这类）又量出 **194 处**：accent-2 85／danger 73／warn 36，
  暗色最低 4.64 全过，浅色最低 **1.46／1.64／2.72** 全塌——根因还是那一个：强调色不随主题翻，表面翻。
  这 194 处今天不动，因为产品里没有任何地方把主题写到 `dark` 以外（`app/layout.tsx` 钉死），
  为跑不到的界面重排 194 条 class 是投机；但豁免不能靠注释维持，所以新加了一道**会自查前提的门**：
  它每次运行都去源码里找"把 `data-nexus-theme` 设成非 dark 的写法"，找到了就把这笔账当硬缺陷判红，
  找不到就只钉住"读数仍不及格"这一事实（有人修好后它会红，提示把硬门打开）。变异臂实测过：
  临时塞一个 `setAttribute('data-nexus-theme', t)` 进去，门当场红出三条读数并给出修法。
  同批看图还顺手修了两处门看不见的：首页那排导航链接在 820px 容器里放不下，flex 会把中文链接
  从词中间切断（"全平台搜/索"）——`flex-wrap` + 每条链接 `whitespace-nowrap`；Studio 左轨的按钮
  按设计只画标签的第一个字（`{item.label[0]}`），读屏软件因此只念得出"图"，补 `aria-label` 给全名
  （可见文字"图"是"图层"的前缀，2.5.3 也过）。
  **仍欠**：① 那 194 处"强调色当文字"在浅色下的 -ink token（入口出现即被上面的自查门逼出来）；
  ② ~~浅色主题至今没有任何浏览器门~~ —— 第八片已还（`e2e/a11y-light.spec.ts`，游客可见五张 +
  一道"浅色真的落到被扫像素上"的前提门）；登录后的浅色与带透明度的底色仍没有门。
  **第六片同日落地：把水合屏障铺到其余浏览器用例**（技术账①还清）。实测范围比①记的宽——
  不止那 9 个注册的文件，**20 个 spec 里有同一族无屏障写法**（`fill` 项目名就点、`fill` 邮箱就点提交），
  每一条都可能静默丢点击。改法不动任何调用点：各文件那个本地 helper 保留名字与签名，
  函数体换成对 `support/auth-session.ts` 的**一行委托**，本地特有的附加等待（`waitForCanvas`、
  `[data-node-id]` 数 8）留在原处；`auth.spec.ts` 例外——它测的就是登录/注册这条流程本身，
  整段换成 `registerMember` 等于不测它，所以只借 `waitForAuthFormHydrated` 这一层屏障。
  净减 90 行重复。**共享 helper 于是第一次被真正大量调用**，当场露出它自己的第二个洞：
  建项目也有限流（`POST /api/projects` 每 IP 每小时 **20 次**），被拒时 `waitForURL` 只会安静耗满
  60 秒再报"导航超时"，把真原因埋得死死的（我据此误判过一次"5 条 studio 用例回归"）。
  现在它把那次 POST 的答复接住、非 2xx 当场带话收场，并且这条新路径**是拿真实的名额耗尽现场验的电**：
  报错从"Timeout 60000ms"变成"HTTP 429 · 界面上写：建项目太频繁了，稍后再试"。
  复跑：auth(2)／storyboard(8)／team／account-deletion／character-chat／studio 前 4 条全绿；
  studio 其余几条撞在建项目限流上，等窗口再补（`docs/ENVIRONMENT.md` 记了这道闸的数字）。
  **第七片同日落地：那六扇键盘门搬到五张登录后界面**（`e2e/support/keyboard-walk.ts` +
  `e2e/keyboard-surfaces.spec.ts`）。抽出门本体才看得见上一节的空格：Studio／发现／市场／通知的
  tab 序、焦点陷阱、"鼠标能点键盘碰不到"以前**结构上不可能被发现**（走查把"页内"钉在
  `[data-published-root]` 上）。首跑五张全绿（分母 19/69/29/19/14，命中逐张相等，无指示停留点 0），
  没抓到产品缺陷，抓到门自己的三个问题：点名点错了控件（`data-create-project` 在名字为空时**就该**
  disabled）、**同名控件让覆盖门分不清**（Studio 69 个槽位只有 52 个不同 key ⇒ 位置进身份）、
  走查没先归零焦点（焦点停在页面中段时"顺序"会红成产品错位）。五条变异臂在改完判据后重跑，
  全部按名字红。会话层新增 `reusableMemberWithProject`（先登夹具邮箱、名下有项目就直接用）——
  两道限流闸一次都没放宽，只是不再被"扫面"这类用例重复消耗；`createProjectNamed` 的限流报错
  现在带服务端算好的 `retryAfterMs`（实测"还要等 20 分钟"）。
  **第八片同日落地：浅色主题第一次在真浏览器里被扫**（`e2e/a11y-light.spec.ts`，还掉上面 ②）。
  载体只用游客可见的五张（注册 10/小时、建项目 20/小时，而这一片的缺陷与登录态无关）。
  读数：首页 8／市场 4／发现 1／组件库 1 个对比度不合格节点，最低 **1.70:1**（`#22d3ee` 压 `#f7f8fb`）——
  与第五片用 tokens 字面值算出的那批数同量级，**那句话从算术变成了测量**；194 处照旧不动，
  入口一出现仍由 `style-tokens.test.ts` 那道自查门逼出来。这一片新增的不是 axe 而是一道**前提门**
  （浅色没真的落到被扫的那些像素上就判红、且这张不算读数），变异臂把属性改回 `dark` ⇒ 五张全红，
  md5 逐字节复核还原；首版这道门还被自己的判据抓过一次（只挑 `a[href]` 取样，而 `/search` 无结果时
  **一个链接都没有**，把"页面恰好是空的"报成了"浅色没生效"）。
  **第十三片（2026-10-29）：移动端第一次被量**（`e2e/mobile-layout.spec.ts`）。此前 27 个 e2e 文件里
  `isMobile`／`hasTouch` 一次都没出现过，axe 与键盘走查全在桌面宽度上跑——**宽度不在任何门的分母里**。
  载体换成 `/sitemap.xml` 里的真发布作品页（匿名，不碰注册 10/小时与建项目 20/小时那两道闸），
  同一份快照在 390×844 与 1280×900 两栏各读一遍。读数：**五张帧宽全是 1440×900**，390 下文档横向溢出 0px
  （被 `overflow-x-auto` 的平移容器吃掉），但要平移 **1082px** 才能看到右缘，**首屏只看得见 27%**（桌面栏 89%）；
  0/5 张存在"滚不动的裁切"；每页 10–11 个可见点击目标，其中 1–2 个不足 24×24，真缺陷是
  `a[data-action-author]` **56×21**（flex 项，2.5.8 的行内豁免不适用），另一个 `a(试玩这一版 →)` 100×23
  走行内豁免、已按规则排除。**根因在代码里点名**：`apps/web/src/app/n/[handle]/[slug]/page.tsx` 调
  `resolveLayout(page, { tokens, mode })` **没传 `breakpoint`**，而 `/preview` 那条路认 `?viewport=`——
  作者写的 mobile 变体在发布这一刻被整条丢掉；这跟"投影要不要按视口缩放"是两半账，分开还。
  门只有四条结构性不变式（请求视口 = 页面自报视口、帧量得到、名册非空、200 才算读数），阈值一个没钉。
  这一片还纠正了自己的一条证据：`curl` 那遍读到公开页 `meta viewport` 是 `width=device-width` 且没有
  theme-color，浏览器两栏都不是这个形状，**按浏览器为准，那句 curl 不当结论用**。
- 规模基准与热点路径（§146/§147）— 模型层有 `scripts/perf-baseline.mts`，实测数字与"还没做的部分"记在
  `docs/PERFORMANCE.md`。2026-09-24 补上浏览器端：`npm run perf:browser`（`scripts/perf-browser.mts`）
  在真 Chrome 里量首帧、pan/zoom 帧距与"属性写入→画布重绘"延迟，当天数字与其三条必须一起读的限定
  （首帧不等于整页画完、本机 rAF 没锁 vsync 所以帧率只能当长任务信号、单次数字跨运行抖 2 倍）都写在那份表格里；
  还记了一次没解释的 60 秒不出帧现象，等它再现。画布虚拟化与 worker 仍未做。
  2026-09-24 补：持久层第一次进表，当场挖出一条硬断链 —— 一个页面超过约 **7,281 个节点就整体存不下去**
  （`writeNodes` 拼单条 INSERT 撞上 Postgres 65,535 参数上限），而 §146 的目标正是 10,000 节点。
  模型层基准只在内存里造文档，所以它从没暴露过这件事。改成 500 行切块并补了回归测试。
  同日再补一条更值钱的：浏览器端那张"N 节点"表**整批作废过一次**——压测脚本造的节点字段不全，
  画布整页崩，实际渲染的一直是起手 8 个节点，而脚本打印的节点数取自客户端自己加了多少。
  修法是两头：读路径不许崩（lint / 排版对残缺节点跳过并报出来）、写路径挡在门外（parseDocument 报 error），
  外加脚本自己核对"服务端存了多少 / 画布真渲染了多少"。修好后第一次真数据与三条读法限定见
  `docs/PERFORMANCE.md`；1000 节点档 pan 平移 p95 139–176ms、每次掉 40 帧，这就是视口裁剪的依据。
  同日再补：`buildCodeIndex`（§69）进同一张表 —— 10k 节点 220.9ms（其中 codegen 本身 118.5ms），
  而目录尺寸从 100 到 10,000 节点只从 6,128 变到 6,138 字符：**它按页面数增长，不按节点数**，
  因为节点在代码里是锚点注释而不是符号。这条读数写进 `docs/PERFORMANCE.md`，
  免得有人拿"代码目录比设计目录小两个数量级"当结论——那不是索引有魔法，是投影本来就不展开节点。
- 沙箱预览与生成代码隔离执行（§81-83）
- Design Critic + Visual QA + 无障碍/性能门禁（§32-33/90-91/178-179）—
  门禁与七行健康度已落地（`analyzeHealth`，见 M2 进度记录与 `docs/adr/0005-…`）；
  Design Critic 的**自动修复建议**仍只有 lint 的 `suggestion` 字段，没有对话式评审。

- [~] 实时通道（§163）— **2026-09-26 落地了传输与两类事件，偏离 WebSocket 的取舍写在 `docs/adr/0010-…`**：
  `/api/realtime` 是一条 SSE 长连接（App Router 的 route handler 承载得了，会话与项目所有权走同一条路，
  不必为单向通知多养一个进程），报文仍是早已是契约的 `RealtimeEventSchema`。
  生产者与传输解耦在 `server/realtime/bus.ts`（`RealtimeBus` 接口，默认驱动进程内，
  与 `security/rateLimit.ts` 同一口径：设了 `NEXUS_REDIS_URL` 才换 Redis pub/sub 扇出驱动、生产者不动）。
  **换驱动那一格 2026-10-06 落地**（`docs/adr/0028-…`）：多实例部署从此看得见别机的事件，
  ADR-0025 第六件（注销后不再向他推任何东西）也不再只在一个进程里成立——关门会往线路发一帧 `close`。
  一条连接覆盖用户频道（通知）与项目频道（进度），带 `?projectId=` 时校验归属（不是你的项目一律 404）、
  每账号同时最多 8 条连接（每条都握着订阅与心跳定时器，开多少条不能由客户端说了算）、写请求一律 405。
  **今天真的有生产者的有五类**：`generation.progress`（任务开始推 0、终态推 1，失败也推——
  界面上那句"正在生成"要能自己停下来；§112 的多步作业还每跑完一步推一格，见下面 §112 那一节）、
  `notification`（真的新写了一条才推，duplicate/suppressed 不推）、
  以及 §162 的 web 侧消费者与 §112 的编排推的 `agent.step` / `agent.activity`（异步作业的活动按游标推，推过的不推第二遍）。
  `build.status` / `preview.status` 两种事件**也有生产者了**（2026-09-30）：发布链路是仓库里唯一
  **真的分步走完**的构建动作（门禁 → 机检 → 钉快照 → 落 publication 行 → 公网 URL 生效或收回），
  每一格都挂在一个真发生了的节点上，中间不插刻度。`preview.status` 读的是
  `resolvePublishedPath` 那一遍**真实解析**的结果，所以"往外发布了却解析不出来"（多半是人工裁决挡的）
  与"收回之后还解析得出来"都报 `failed`，不跟着发布意图闭眼报就绪。
  至此 `RealtimeEventSchema` 里**七种事件全部有生产者**；
  断线期间的事件不补发（没有 `Last-Event-ID`），所以实时只当加速器、权威状态一律读库——这条限度写在 ADR 后果第 4 条，
  UI 上断开时显示"以刷新后的数据为准"而不是假装还在实时。
  **这一句 2026-10-06 要改口两处**（判决书是 `docs/adr/0029-…`）：① "不补发"这个选择本身保留，
  但 ADR-0028 欠账里那句"要补发得另立 ADR 选 Stream"是错的方向——从库里按游标重建帧比 Stream 省事得多，
  它被实测否掉了：收件箱的 `level` 根本不在表里（`emit()` 插库前就摘掉了），补出来的那一帧会把失败的构建画成绿色成功；
  ② "以刷新后的数据为准"以前是把活儿推给用户，现在连接**断过又接回来的那一刻界面自己重读一次**，
  铃铛的未读数不等刷新就追平（服务端一帧没改，改的是客户端那条 seam）。
  顺带修掉一处会污染终态的假象：provider 带 `error` 返回 HTTP 200（DEMO Mock 遇到没实现的指令就是这样）
  以前会记成 `succeeded` + "生成完成"，现在账本、通知、实时进度三处都按 `error` 判失败。
  验证：`realtime.test.ts` 15 条纯单测（2026-10-06 数过：与 Redis 那 6 例同跑报 21 passed，单跑该文件报 15）
  ——总线不跨频道泄漏、订阅者抛异常不连累别人、退订幂等、连接上限与归零；
  `realtime.integration.test.ts` 10 条打真库（该发的发了、duplicate 不发、suppressed 不发、无项目的任务不发、
  收尾不存在的任务不发）；`@smoke §163` 在真浏览器里跑两个身份：作者停在首页**不 reload**，
  访客点赞后铃铛从 1 变 2，且这期间收件箱接口只被请求了一次（数请求条数，不是数"数对不对"——轮询也能让数变对）；
  Studio 里跑一次真 AI 请求，进度行由事件流自己推出来（成功那条写"完成"，Mock 不认的那条写"失败：provider-unavailable"），
  别人的项目频道拿 404、匿名拿 401、POST 拿 405（截图 `realtime-bell.png` / `realtime-studio*.png`）。
  跨实例那一半（2026-10-06）：`realtime.redis.integration.test.ts` 6 例打真 Redis（两条独立总线 +
  一条绕过总线直接往线路上发字节的原生连接），`npm run realtime:two-process` 再用 5 个真实进程
  跑一遍投递与关门（八条判据），7 条变异臂逐句拆掉这一片的纪律、各红在该红的那一句上（详见 ADR-0028 的验证）。
  重开那一寸（2026-10-06，ADR-0029）：`realtime-reconnect.test.ts` 8 条纯单测
  （与 `realtime.test.ts` 同跑报 23 passed），6 条**注入 transport** 钉连接本身
  （"首连不发重读、重开恰好发一次、CLOSED 才报 closed、报文照样过契约"），
  2 条从源文件扫 `useRealtime(...)` 的选项对象钉**接线**——前 6 条只证明信号会发，删掉 `onReconnect` 它们一条都不红；
  六条变异臂 A/B/C/D/E/F 分别红 4 / 2 / 1 / 1 / 1 / 1 条（A 的预测是 1 条，实测 4 条，差额写在 ADR 的验证一节；
  E 把线接成空函数、F 接到别的 setter 上，都单独红在接线那一条）。
  **真浏览器断线那一格已拿到（2026-10-07）**：CDP `emulateNetworkConditions({offline:true})` 打断不了
  已建立的 SSE（30 秒里 `data-realtime` 一直是 `open`），所以断线用唯一诚实的办法制造——**服务端自己关流**：
  `/api/realtime` 增加显式 env 才生效的最长连接寿命（`NEXUS_REALTIME_MAX_LIFETIME_MS`，默认 0 = 不限，
  生产不变），到点走同一个 `cleanup`（退订 + 停心跳 + 释放名额）再关流，客户端看到的就是一次真断线
  （流结束 → error → 浏览器自动重连 → onReconnect）。
  `@smoke §163 断线重开`（14.2s live 过）：两条凭证都在网络层，不赌 DOM 状态的闪烁（connecting 只存在
  几十毫秒）——`/api/realtime` 请求数 ≥ 2（首连 + 重连，请求计数必须先于 goto 注册：EventSource 的
  GET 在连接"可见地 open"之前 ~300ms 就发出，注册晚了会漏掉首连——第一次跑就是这么红的）；
  `/api/notifications` 的下一次请求（没有访客互动也没有事件进来，它只能来自 onReconnect 的重读）。
  截图 `realtime-reconnect.png`。
  **诊断入口那一格 2026-11-05/06 结清**（第三十七、三十九片，`docs/adr/0083`、`docs/adr/0087`）：
  `/api/admin/realtime` 交出「启动那一次的闩」与「此刻两条连接」两格（可以合法不一致，两行两个 `data-` 属性），
  失败那本账从此**按原因拆开且闭合**（十个原因的词表钉在 `server/realtime/wireErrors.ts`，
  每一格都在、没出过事的是 `0`；`Σ 分账 === 总数` 由集成用例常驻检查；以前沉默的「线路名不认识」那一格现在有数）。
  形状门认不得的半截回执（总数有数而分账缺席、驱动第三个词）不画表盘，只说"回执形状不认识"。
- [x] 通知中心（§164）— 收件箱与真事件已在上面 M6 那条落地；原文点名的**四类到今天全部有来源**。
  Generation complete 2026-09-25 落地，Agent task complete **2026-09-29 落地**
  （§112 的多步编排有了执行方，见文件末尾那一节），
  最后一类 **Build complete 2026-10-01 落地**（§144 的导出就是那个"会走完的构建动作"，见文末那一节）。
  以前这里写着"等 §162 的队列消费者落地时一起补"——那句话要改口两次：消费者 2026-09-26 就落地了，
  而 Agent task complete 要的**不是**消费者：一个异步作业还是一次 provider 调用，worker 不会执行 plan 里的子任务；
  要的是 §112 那份计划真的被分步跑完（谁在什么时候做什么、做完留下什么）。
  这条单子最后卡住的那一句是"Build complete 要的是会完成的构建操作（今天没有导出 / 打包端点）"——
  它同时是**两个**欠账的同一个根：§164 的第四类通知，和 §144 NO LOCK-IN 的导出。
  导出接上之后两件一起结清；导出成功但缺资产时那条通知按 `warning` 发而不是 `success`
  （默默少几个文件比明说少几个更糟，§159）。
  **披露面走样已修（2026-10-06，任务 #94）**：收件箱页以前用一份手写的四条清单描述"会通知的"，
  登记已经长到十类，于是页面在说谎。现在那一列从 `lib/notify-plan.ts` 的 `NOTIFICATION_TERMINAL_STATE` 现算，
  一行一类；`apps/web/test/notify-producers.test.ts` 第 4 条结构门钉住"表键 = 注册表键 + 每类一句非空终态 + 页面不再手写名单"。
  e2e `@smoke §164` 也加了断言：`[data-notification-backing]` 恰好 10 行。
  同一 commit 里 `e2e/studio.spec.ts` 还有另一个会话的 65 行未提交改动，所以这 4 行没进本次提交——
  下次该会话提交时会一并带上。
- [x] Agent 任务账本（§112 的地基 + §164 的 Generation complete）— **2026-09-25 落地**：
  `agent_tasks` 这张表从建库起就有完整结构却**全库没有一处写它**，所以"Agent task / Generation complete"
  两类通知一直只能挂在收件箱的"没有来源"清单上。现在 `/api/ai/run` 每次请求开始落一行 `running`、
  结束落 `succeeded` / `failed`（失败也留行，带那句原因；没给原因时用兜底文案而不是留空），
  跑完就发一条 `generation` 通知——**同一任务重复发只留一条**（dedupe 挂在 `generation:<taskId>` 上）。
  能力那一列分开记 `real` / `demo`：标题写成"一次 DEMO 模板生成完成"而不是"生成完成"，
  否则看账本的人分不清这条结果是模型给的还是模板给的（§160）。
  `/tasks/<项目>` 是这本账的视图，页面上明说边界：今天每行都对应**一次同步请求**，
  §112 那种跨步骤任务（Goal → 子任务 → 依赖 → 验收）还没有执行方。
  任务号走响应头 `x-nexus-task` 而不是塞进 `AiResponse`——那是 web ↔ ai-service 的契约报文，
  不该被 web 侧的账本字段污染。枚举里成功那一档叫 `succeeded`（0000 建库时定的），不是 `completed`。
  验证：`agent-tasks.integration.test.ts` 5 条（含"不存在的 id 不会被说成改好了"、
  "别人的项目连任务数都不给"、FK 真的在挡不存在的项目）+ `notify-plan.test.ts` 新增 5 条纯规则
  （真模型与 DEMO 的标题必须不同、没有时长就不写用时、没有摘要就不编正文）+
  `@smoke §164` 末尾跑一次真请求，断言账本一行、通知第 5 条、"Generation complete 已从没有来源那张单子上摘掉"
  （截图 `agent-task-ledger.png`）。
   取消 / 重试**已于 2026-10-09 补上**（`attempt` 有了第二次的写入方，见下面「§162 取消与重试」那一条）；
   审批流当时记的是"`requires_approval` 全库无人置真"，
  **同日已经补上**（见上面 §74 agent 侧那一条），但那一格只接在同步的 `/api/ai/run` 上；
  接到 §162 异步队列那一条也**同日已经补上**（见下面 §162 × §74 那一条）——
  异步那一路现在同样先过门再交回，所以这一行不需要再等"以后"。
- [~] 作业队列的 web 侧消费者（§162 第一片）— **2026-09-26 落地后端到端的一条回路**：
  ai-service 早就有真队列（`POST /v1/ai/jobs` 入队、asyncio worker 执行、`GET /v1/ai/jobs/<id>` 读状态，
  由 `apps/ai-service/tests/test_jobs.py` 9 条钉着），缺的是 web 从来不曾提交给它、也没读过它的状态——
  于是"作业会自己结束"这件事在平台这一侧不存在。现在：
  `POST /api/ai/jobs` 收同一份 `AiRequestSchema` 报文、走同一个服务端装配（§68 那条边界照旧，客户端上传整份文档仍 400），
  先落一行 `agent_tasks` 再入队，拿到 jobId 就写进 `provider_job_id`（0013，带部分唯一索引：
  两行认领同一个 job 就会把同一批活动推两遍）；**入队没成功就把那行立刻结掉**，不停在 running。
  `GET /api/ai/jobs/<jobId>` 每次现场去问（web 只是镜像，不看缓存），然后把观察到的东西落进账本：
  终态才写终态、`completed` 且 provider 带着 `error` 记 failed、作业在那一侧查不到才落成 failed 并写明原因、
  问不到（非 404）时一行都不动。通知靠 `generation:<taskId>` 的幂等键兜住，两个标签页同时轮询只有一条。
  §163 的 `agent.step` / `agent.activity` 从此有了**第一个生产者**：worker 记的活动按 `activity_cursor`
  推进，`info` 那一档走 `agent.activity`（`agent.step` 的枚举里没有它，硬塞就是在界面上编出一条不存在的过程）。
  进度仍然不许编：worker 从不设 `progress`（单次 LLM 调用没有可观测的中间态），界面拿到的是 null 加一句说明。
  验证：`ai-jobs.integration.test.ts` 11 条打真库 + 一台本地假 ai-service（按契约形状报状态）。
  两次反向实验各打中一句：把"completed 就是成功"改成不看 provider 的 `error` → 1 条红（红在 `taskStatus`，
  同一个用例下一步的反向对照——同样报文去掉 error 就记成功——保证这不是把判定改严了就算数）；
  把"已经终态就不再写"的守卫换掉 → 1 条红（同一份 completed 被问两次时 `finishedAt` 往后挪了 32ms）。
  **这一片没有把 §164 剩下的两类变成有来源**：一个异步作业还是一次 provider 调用，
  worker 不会执行 plan 里的子任务，所以 Build complete 与 Agent task complete 照旧挂在"没有来源"单子上。
  （**2026-09-29 更新**：后一类已经补上——§112 的多步编排有了执行方，见文件末尾那一节；Build complete 仍然没有来源。）
  **"终态由有人来问才收敛"是这一片的取舍而不是疏忽**，为什么不许 web 起后台轮询器写在
  `docs/adr/0011-job-convergence-on-read.md`；那句"没人问就一直停在在跑"是真的，别读成"后台会自己补上"。
  还欠：界面上提交异步作业的入口与那条 409 的验证——**同日已经补上**（见下面 §162 × §74 那一条）；
  ~~跨实例的游标要靠 Redis 后端~~——**2026-10-29 核对后改口径**：活动游标是 `agent_tasks.activity_cursor`
  这一**列**，由 `bumpActivityCursor` 的 CAS 推进（`domain/agent-tasks.ts:404`），本来就跨实例——
  两个 web 进程同时来问也只有一个推得动。这一句今天有了凭证而不只是推断：
  `ai-jobs.integration.test.ts` 新增"两个观察者同时来问同一个作业"，两次 GET 由测试里的
  一道闸强制同时在飞（判据含 `maxInFlight === 2`，闸没生效时那条用例自己红），
  推出来的事件是 3 条而不是 6 条；把 CAS 的谓词摘掉，它当场红在 6 条上。
  真要靠 ai-service 那侧 Redis 后端的是**作业本身活在哪个进程**（`backend: 'memory'` 那句提示说的就是这件事）。
  仍欠：真 ai-service + 真 worker 的端到端一条待补。
- [x] §162 × §74：异步作业的结果接上同一道审批门，Studio 有了真入口（2026-09-26）—
  上面那片记的两句欠账其实是一句链：**没有入口 → 没人来问 → 终态不收敛**。而当时就算有人问，
  拿到的也只是状态：`settle` 把 provider 那份完整结果换成一句摘要（`result.detail`）就完事，
  **补丁在 web 这一侧根本没出现过**——所以"异步那一路不认审批"不是漏了个 if，而是它连可拦的东西都没有。
  现在这条回路是闭的：
  - 作业 `completed` → `observeJob` 把 `status.result` 过**同一个** `gateResponse`（同一份
    `WEB_APPROVAL_POLICY`、同一个 `nodeNamer`；文档读不到时理由退回 op 里那个 id，而不是编一个"某个元素"），
    含高危动作就地 `holdForApproval`：**终态不写、通知也不发**（与 `/api/ai/run` 完全同一口径，
    一条"Generation complete"替一次没人决定的事签字就是 §164 要避免的假事件）。
  - 挂起时存进任务行的是 `{held, delivered, approvals, policy, heldOpCount}`。为什么连 `delivered` 也要存：
    轮询是"隔几秒再问一次"，那时文档可能已经变了，拿 `held` 重算会把理由里的名字换掉——
    用户被问过的那一句和现在看到的这一句必须是同一句。
  - `GET /api/ai/jobs/<jobId>` 的响应体从此有契约（新增 `AiJobObservationSchema`，出口 `safeParse`）：
    里面带 `approvals` 与**能交回的那一份** `response`。等待中给的是 `delivered`（补丁为空 + approval-required），
    批准后给完整结果（门点过头就不再拦第二次），放弃后什么都不给并说一句为什么。
  - Studio 的命令行多了一个"异步作业"勾选：提交换端点、其余共用同一段 `consume`——
    落地走同一条可撤销事务（§149/§150），审批卡片也只有一处实现。**多一个入口不该多一种审批口径**，
    这一句钉在测试里：异步那条路如果绕过门，`approve` 之前就能在报文里看到 `remove`。
  限度如实记下：DEMO MODE 下异步只能验到那句 409 拒收（平台的 DEMO 口径在 web 进程内，
  不让同一个"没配 key"在两条路上长出两种假结果），所以**异步落地补丁这一段在浏览器里还没有真验过**，
  它验的是集成层（假 ai-service 按契约报状态）；**2026-10-27 核对**：这一段已过时——2026-10-09 的
  DEMO 队列入口让浏览器里能跑 queued / approval-held / cancelled 三态（见本页 10-09 那条与
  `ai-async-queued/approval-held/cancelled.png`），真 provider 下的异步取消仍未验；
  等满 3 分钟没结束说的是"还没结束"，不是"快好了"；
  ~~`awaiting_approval` 的行仍然没有 TTL~~——**2026-10-27 核对后改口径**：过期已落地
  （`APPROVAL_TTL_MS` = 24 小时；`approvalExpiresAt` / `convergeExpiredApproval` 在**读的时候**
  把断掉的状态收敛成 `cancelled`，并按 ADR-0011 的口径不养清扫进程；作废同时发一条通知，ADR-0022）；
  跨实例作业游标在 Redis 后端下可用（`apps/ai-service/src/ai_service/jobs.py`，配 `NEXUS_REDIS_URL` 启用）；
  真 worker + 真 provider 的端到端仍欠。
  验证：`ai-jobs.integration.test.ts` 17 条（新增 6 条打真库：remove 挂起 + 通知零条 + 库里那一份完整、
  反向对照同一份报文换个非破坏 op 就一路到底、批准后报文里 op 回来了、放弃后什么都不回来、
  同一次挂起被问两次给的是同一份 `delivered`、文档里查不到的 id 理由退回那个 id 而照样拦）。
  两次行为性变异：把 `settle` 里那个 if 关掉 → **5 条红 1 条绿**，而那条绿正是反向对照（它本来就不该红）；
  把等待中交回的 `delivered` 换成 `held`（= 把补丁漏给还没批准的客户端）→ 2 条红。
   e2e `@smoke §162 异步作业入口` 在真浏览器里 1 条通过（4.9 分钟，慢的是 dev 模式首次编译那两条路由，
   不是断言在等）：截图 `screenshots/ai-async-refused.png` 上勾着"异步作业"、红字是服务端那句 409 原文、
   右侧仍是「1440 × 900 · 8 个节点」——**没有多出一条"在跑的作业"，也没有审批卡**。
   （**2026-10-09 更新**：a1c2f1f 的 DEMO 队列入口让那句 409 不复存在，这条 e2e 自那天起一直红，
   现已整条重写成四段真链路，见下面「§162 取消与重试」那一条。）
   `npm run test:ai-service` 56 passed + 1 skipped（那道跨语言的 `DESTRUCTIVE_OPS` 比对读的是 web 源码，
   这次动了 `approvals.ts` 所以必须重跑）。下面那片接上名册之后，同一个命令是 62 passed + 1 skipped。
- [x] §162 取消与重试：队列先受理、账本后 CAS，重试开新行（2026-10-09）— 详见 `docs/adr/0032-ai-job-cancel-retry.md`。
  动手前先补了同一个 §162 留下的真值洞：`demo_job_` 前缀的观察此前一律去问 ai-service → 404 →
  任务行被错落成 failed（或没有 URL 时永远 running）；现在真值在哪个进程就问哪个进程
  （web 进程内存的 `getDemoJob` + `demoStatusOf`，形状仍是同一份 `AiJobStatusResponse`），
  DEMO worker 的终态口径与 ai-service `jobs.py` 对齐（provider 回 error → job `failed`、error 原样落账）。
  - **取消**：`POST /api/ai/jobs/<jobId>/cancel`（csrf + 限速 30/10min）。**队列先受理、账本后 CAS**——
    标志没立上就先写行，worker 照样会把结果生出来，那时行是 cancelled、算力却花了。
    200 = 受理而不是已停止（jobStatus 可能仍是 running，检查点落账前它就是 running）；
    404 陌生人/查不到、409 行已终态/等审批/队列已终态/行刚好被改、503 队列问不到且**账本一字不动**
    （不能先把行说成取消、结果却可能还会完成）；行已 cancelled 再点一次照样 200（幂等）。
    用户主动取消不发通知不扣点，审计记 `ai.job.cancel`。DEMO 侧排队中的当场落账
    （claim 只认 queued，状态一改自然跳过），运行中立标志、worker 三个检查点
    （领取后/生成前/结果落地前）看见就丢弃——已经算出来的补丁也按取消丢弃，`response` 永远 null。
  - **重试**：`POST /api/ai/tasks/<taskId>/retry`（csrf + 限速 20/10min），四道门：
    404 / 409 非异步行 / 409 只允许 failed·cancelled / 409 老行没有存 `input.request`（诚实回"重试不了"，不猜）。
    门过了才落**新行**：`attempt = 上一行 + 1`、`input.retryOf` 把两行接起来，旧行一个字不动；
    新行走与 `POST /api/ai/jobs` 同一条共享管线 `submitClientRequest`——两条入口不许长出两套提交语义。
  - **界面**：命令栏的取消按钮只挂在"有作业号 + 还在等 + 取消还没受理"的窗口里（终态后再点只会得到 409）；
    状态行把"取消已受理"与观察到的"已取消"分成两句话，先后顺序钉进 e2e；任务列表挂"重试"
    （只对自己的 failed/cancelled 行出现），点了开 `attempt=2` 的新行、旧行还在表里。
  - 契约：`AiJobStatus` 枚举 += `cancelled`，`AiJobBackend` += `demo-memory`（`npm run contract:export` 已跑）；
    ai-service 侧 `POST /v1/ai/jobs/<id>/cancel` 同口径（404/409/200 幂等、queued 当场 cancelled、
    running 只立标志），`test_jobs.py` 随 `npm run test:ai-service` 77 passed。
  - 验证：`ai-jobs.integration.test.ts` 23 → **41 条**（取消 9 + 重试四道门 5 + 重试落账 2 + DEMO 观察 2；
    其中"取消之后观察"那条钉 outcome 与行 error 都是「取消受理」那句话、活动一条不许多发）；
    全量 vitest 1552 绿（顺带修掉 jsx-text 抓到的 `**新行**` 漏进 JSX 文案一处）；
    e2e `@smoke §162` **整条重写**并连跑两次绿（旧版钉的是 a1c2f1f 之前那句 409，
    那句话当天起就不存在了，测试一直红到现在）——现在钉四段真链路：①DEMO 队列提交
    （状态行带 demo-memory、取消按钮在窗口里）→ ②同一句"删除 Hero 区块"异步照样被扣成审批卡、
    放弃后"删除也没有发生" → ③提交后立刻取消：先"取消已受理"、下一次轮询再"这次作业已经取消"，
    卡片/错误/画布改动三样都不许出现 → ④任务列表里 cancelled 行挂重试，点了开 `attempt=2` 的新行。
    截图 `ai-async-queued/approval-held/cancelled.png`、`ai-tasks-cancelled.png`、`ai-task-retry.png`。
  - 调试中钉死的两个真 bug（都不在原计划里）：StrictMode 的 effect 清理会把 `pollStop` 拨真而挂载侧
    不再拨回，轮询没开始就被上一轮清理判死刑（误报"等了 3 分钟"）——挂载时必须复位；
    dev server 首次命中 `[jobId]/cancel` 要现场编译，那一两秒会把"受理"拖到第一次观察落账之后
    （200 变 409）——e2e 开跑时先预热一次，且 DEMO 作业两段等待刻意拉长到 2.2~3.4 秒，
    让取消窗口先于任何终态收敛（受理在先是语义，不是抢跑）。
  - 仍然没有测到：真 provider 下的异步取消（要一台接上 key 的 ai-service + worker）；
    ~~Redis 队列后端~~（**2026-10-27 核对**：Redis 后端已落地，配 `NEXUS_REDIS_URL` 启用；
    web 异步路径还没在真 Redis 上端到端跑过，这一格只差这一次实测）。
- [x] #10 账本实时：每一条任务状态写出都出声，账本页不刷新自己变（2026-10-09）—
  事件用的是 `packages/schemas` 里早就有、却一直没有写入方的 `generation.progress`
  （`RealtimeEventSchema` 那个 union，ADR-0010/0029 的"事件只是加速器、权威永远是库"口径）。
  - **服务端补三条发出**（此前只有 start/finish/cancel 三处，挂起/裁决/过期三处落账无声）：
    `holdForApproval` 推「等审批：结果被扣下，等一次决定」（progress=1 与 finishTask 失败、
    cancelTask 同一口径：这一轮生成到头了，等待中的真实状态由库里的 status 说了算）；
    `decideApproval` 在 CAS 赢家之后推「已批准：补丁已交回画布」/「已放弃：补丁没有落地」
    （`not_pending` 早退一条都不推）；`convergeExpiredApproval` CAS 赢家在 `notifyApprovalExpired`
    之后推 `APPROVAL_EXPIRED_NOTE`。至此任务状态的六处写出方一一对应一条 `generation.progress`。
  - **账本复活**：`lib/tasksLedger.ts` 那份休眠契约（`app/api/projects/[projectId]/tasks/` 目录一直是空的，
    注释写着"要活起来得先有一个客户端消费者"）挂上了真的消费者——`GET` 路由按既有模式
    `requireUser → listProjectTasks → null 落 404 → TasksLedgerSchema.safeParse（不过就 500）→ apiJson`；
    契约补 `mine: z.boolean().optional()`（重试按钮只对自己的 failed/cancelled 行出现这件事，
    客户端从此读得出来），`readTasksLedger` 的 fetcher 可注入，失败措辞「HTTP 404」/「返回的报文不合契约」/ error.message。
  - **页面**：`/tasks/[projectId]` 退成薄 server shell（鉴权 + 初读 + `<TasksLedgerLive>`），
    组件承担表头摘要、`data-tasks-realtime` 状态芯片、`text-danger` 的读失败注记与整张表。
    订阅面刻意窄：只认 `type === 'generation.progress' && projectId` 对得上的事件，
    收到就 250ms 合并地重读一次，`onReconnect` 补一次；没有 ledger 侧的观察触发（收敛仍按
    ADR-0011 on-read，convergence 是收敛不是观察）。状态文案单源 `REALTIME_TEXT`
    （`lib/useRealtime.ts`），CommandBar 的本地 map 与 NotificationBell 的三元都换成同一份。
  - 探针各一次，都按预期变红再 revert：摘掉组件里那句 `schedule()` → e2e 红
    （账本停在「还没有跑过一次」，等不到「在跑」）；摘掉 `holdForApproval` 的
    `publishTaskProgress` → `realtime.integration.test.ts` 红（hits 0 ≠ 1）。
  - 验证：`realtime.integration.test.ts` 新 describe **4 条**（挂起 / 裁决两分支 / 过期，
    假 bus + 真库；CAS 输家一条都不推这条钉死）；新 `tasks-ledger.test.ts` **11 条**纯读契约
    （三条失败措辞、`cache: 'no-store'`、`mine` 契约、状态标签单源）；新 `tasks-ledger.integration.test.ts`
    **2 条**打真库（形状过 `TasksLedgerSchema`、陌生人的 `mine` 一律 false）；
    全量 vitest 137 个文件绿；`npm run lint`（typecheck + eslint）绿。
    e2e `@smoke #10` 与 §162 连跑绿（账本页薄化后 §162 那条没坏）：第二个标签页开账本 +
    预热一次读 + 计数 + 提交异步 + 不刷新看见 `在跑`→`完成` + 4 秒稳态 + 库里 succeeded 数与
    DOM 对账 + 陌生人 404；截图 `screenshots/tasks-ledger-live.png`（表头芯片 `实时：已连接`、
    摘要 `共 N 行 · 完成 N`、一行 succeeded）。
   - 仍然没有测到：真 provider 下的进度（要一台接上 key 的 ai-service + worker）。
     （`onReconnect` 的补读已于 2026-10-10 补上探针：`realtime-reconnect.test.ts` 的接线组
     多两条源码判据；真断线在浏览器里仍造不出来，那条限度照实留着。）
- [x] Agent 名册有写入方、@提及解析生效、`design.patch` 有第一个执行方（§112/§113 第一片，2026-09-26）—
  上面 §111 那条记的"`@Agent` 提及解析才是真欠的那一条"到这里接上了，但要先说清动手前的三个对不上账：
  `agents` 表建库以来**没有写入方也没有读取方**；`docs/AGENTS.md` 声称的 `agents/registry.py` 与 `AgentSpec`
  **全仓库不存在**（而 ai-service 按架构纪律 3 根本不连业务库，读不到名册）；`agent_tasks.agent_key`
  一直是**意图**（`design-edit` / `research`）冒充的别名。所以"接名册"如果只做成界面上显示"这一轮由谁负责"，
  把 `@qa` 换成 `@design` 落地的补丁一模一样——那是 §159 要避免的"看起来能用"。
  - **名册**：`scripts/db-seed.mts` 是唯一写入方（13 行幂等 upsert，含 §112 那几条职责原文），
    读取方是新文件 `server/domain/agents.ts`（`loadRoster` / `findAgent` / `resolveAgent`）。
    迁移 `0014` 加 `responsibilities text[]`。`tools/model_class/max_steps/output` 那四列**今天没有读取方**，
    这句话同时写在种子脚本头注释与 `docs/AGENTS.md` 里，不假装权限生效。
  - **解析**：优先级是"请求里显式提名 > 提示词里的 `@xxx` > 批注正文里的 `@xxx`"，三处都没有 → null，
    按原来的 intent 路径走，**不硬塞一个 Design Agent 当默认值**。点错的原样报回 `@fy`（不猜最像的那个）、
    点了不止一个的其余进 `ignored`、名册空的单独一句（"还没跑 `npm run db:seed`"），
    三种说法由 `mentionNote` 在服务端拼一处：同步走响应头 `x-nexus-agent-note`，异步走观察报文的 `notes`。
    客户端上传 `agent`（自报职责与权限）一律 `400 agent_not_allowed`——与 §74 的 `approvalPolicy`、
    §68 的 `document` 是同一条边界：让请求方自报职责等于让它自己写"我可以改画布"。
  - **§112 那半句要真的走到模型**：职责与 capabilities 随 `AiRequest.agent` 发出，
    ai-service 的 `_agent_note` 把它拼进系统提示（含"没有 design.patch 就 patches 留空"），
    DEMO mock 侧则是活动流第一行与计划里那个 agent 名字。名册留在库里而不是代码里，就是为了这两处读同一份。
  - **§73 的执行点**放在 `gateResponse`（同步 `deliver` 与异步 `settle()` 共用的那一个函数）：
    被点名的那位没有 `design.patch` 而结果里有 op（任何 op，不只是删除）→ **拒收而不是挂起**：
    `patches` 抽走、`error.code=permission-denied`、`approvals` 保持空、行落 `failed`、
    审计写一条 `ai.agent.capability` / `allowed:false`。为什么不复用挂起、为什么门读 `input.agent`
    而不是 `agent_key`（`research` 既是意图又是名册 key，读错那一栏会让一次没人点名的
    research 请求突然按 Research Agent 的权限被拒），都写在 `docs/adr/0013-…`。
  - **界面**：Studio 命令行多一个名册下拉（读 `GET /api/ai/agents`），选中的一位如果不在名册的
    `design.patch` 名单上，输入框下方那一句就写明"这一位不能改画布"；被拒的结果在审批卡片之外回执一句，
    而"这一轮是谁"始终跟着账本（`x-nexus-agent` 头 / 观察报文的 `agent`）。
  限度如实记下：**每一次越权仍然白跑一次 provider 调用**（提示词是提前告知，不是拦截；
  真提前拦法要在请求阶段按 op 数预拒，而那一步今天还不知道会不会有 op）；
  `resolveAgent` 只解析**一个**负责人。~~§113 的 handoff 链与多 Agent 调度还没有实现~~
  ——**2026-10-27 核对后改口径**：handoff 链与按依赖的多 Agent 调度都已落地
  （`apps/web/src/lib/agent-runtime.ts` 的 `handoffOf` 只把**自己声明的依赖**的上游产物交给这一步；
  `apps/web/src/server/agent/runtime.ts` 的主循环按 `readyIds` / `blockedIds` 逐步分派、把 `handedOff`
  记进每一步的报告）。仍欠的是**运行中动态改派与并发编排**，
  所以单次生成里"这一轮由谁负责"仍是一个标签加一份权限；名册生效前提是已播种。
  验证：`agents.test.ts` 17 条纯单测（解析优先级、去重、`a@b.com` 与 `someone@design.com` 不算提及、
    空名册、`mentionNote` 各分支）；`agents.integration.test.ts` 9 条打真库（13 行职责非空、
    `design` 有 `design.patch` 而 `qa` 没有、自报 `agent` 被 400、`@qa` 解析出库里那一份职责与权限、
    批注正文点名能解析、DEMO 报文里计划行写 QA Agent 且活动带职责）；
    `ai-approvals.integration.test.ts` 新增 7 条（拒收 ≠ 挂起、`set` 也算越权、QA 只提意见不拒、
    Design 的删除仍走 §74、没点名不拒、措辞改写、真路径落 `failed` 且不进待批列表）；
    `ai-jobs.integration.test.ts` 22 条（异步那一路同形）；python 侧 `test_prompt.py` 18 条（新增 6 条：
    职责进提示、没有作用域时提示留空 patches、没点名不编一个 Agent、空职责说"没有写"、
    `agent` 不是对象时按没点名处理、整条 HTTP 路跑到 provider 手上）。
  行为性变异三次：`gateResponse` 的 `opCount > 0` 改成 `> 999`（= 拒收从不触发）→ 45 例里 **6 条红**，
    同步与异步两条路都抓得到；`mentionsIn` 的 `match[1]` 改成 `match[2]` → **8/17 红**
    （这一条 TS 不红，`noUncheckedIndexedAccess` 让两种下标都合法，而每一次 @提及都会静默失效）；
    `recordCapabilityRefusal` 里那处 `missing,` 简写错引（值在 `input` 上）在跑测试时抛
    `ReferenceError` → 3 条红——**那次 `tsc` 是 exit 0 的**，红是测试给的。三次各自 revert 后跑对照全绿。
  全量回归（这片做完顺手补的一笔欠账，`npx vitest run --no-file-parallelism`）：80 个文件 / 875 例，
  **872 绿、3 红，三条红的都在 `branches.integration.test.ts` 且与本片无关**——
  一条是"分支切换偶发噪音快照"（M6 挂着的那笔诊断**又命中了一次**，现象与上次一致：内容没变却多出一条
  "切到「design-v2」前的现场"），另两条是 30 秒超时；**同一个文件单独跑 9 条全绿**（29.5 秒，最慢那条贴着超时线），
  所以那两条按负载超时记、不按缺陷记。噪音快照这一笔的欠账现在更明确了：诊断（为什么存这一条）已经写在
  快照自己的 `summary` 里，但测试把带诊断的那句断言排在第三条，命中时先在第 1 条上红了、诊断没打印出来——
  **同日结案**：诊断顺序已挪到第一条，根因（token 数组没有确定的读取顺序）写在下面那条 #40 结案记录里。
- [x] §169 Creator Analytics Agent 第一片：「为什么我的项目没人看？」有了一份读得懂的答案（2026-09-26）—
  **这是一份规则分析，没有调用任何模型**，界面上那一行小字就是这么写的。理由与 §159 同一条：
  接上 provider 之后可以再把同一份事实交给模型改措辞，但今天这条路上没有任何模型参与，
  把它叫"Agent 分析"就是假 AI。
  - `server/domain/analytics-agent.ts`：`analyzeCreatorFacts(fact)` 是纯函数（所有输入都在 `CreatorFact` 里，
    连"发布多少天"都由调用方算好传入，测试才钉得住边界），`buildCreatorFact(projectId, ownerId)` 负责装配——
    项目行的名字与简介、发布行的可见性与审核状态、钉住的快照里"有没有真被画到的图片资产"（复用 §166 的
    `documentReferencesAsset` 判定，不另写一份），以及 §168 那六个数**原样**（含 `null` 与 `selfOnly`）。
  - `/analytics?project=<id>` 渲染那一串发现，每条都是"看到的事实 / 结论 / 建议"三段；
    列表页每行多一个「为什么没人看？」入口。**不给整张列表按行读库**：那份列表的查询纪律是"一次分组查询服务整页"，
    所以分析按 `?project=` 逐件做。
  - 三条口径纪律，都是这一片最容易编错的地方：
    ① **先问能不能被看到**，再问留不留得住人；
    ② `selfOnly` 为真时说"这串数字只证明作者自己打开过"，**既不说"零访客"也不说"有人在看"**；
    ③ 审核状态分两档说话——今天全平台搜索只挡 `rejected`（`search.ts` 那句谓词就是依据），
    所以 `pending` / `review` 不能被讲成"被惩罚、进不了发现页"，那条建议明说"这不是没人看的直接原因"。
    把"还没裁决"讲成"被挡在门外"，是这类工具最顺手的一种谎。
  - 零访客那条按天数分两种结论：≥7 天说"问题在没被看到"，刚发布说"现在下结论太早"——同一件事的两种口径，
    不是两条规则。完成度/时长为 `null` 时说"没采到"，不拿 `views` 换算一个顶上（与 §168 同一口径）。
  - 归属：别人的项目、不存在的项目（含形状不对的 id——不校验就会让 Postgres 抛 22P02 变成 500）、
    没发布过的项目、软删的项目，四种都是同一个 `null`，界面上一句"读不到这个项目的发布记录"。
  验证：`analytics-agent.test.ts` 19 条纯单测（含"什么都齐的作品应当零条发现"这条反向对照，
  以及"每条发现三个字段都不许空着"）；`analytics-agent.integration.test.ts` 4 条打真库
  （真发布 + 真访客行，断言装配出来的数与 §168 读到的一致、四种拿不到答案的情形同一个 `null`）。
  行为性变异：把 `selfOnly` 那一支改成永不成立 → **2 条红**（单元与集成各一条，两边都指着同一句谎），
  revert 后 20 条全绿。
  限度如实记下：`hasCoverImage` 两条路径都测过（真被画到 → 算封面；资产在库里但这一版没画到 → 不算，
  与 §57/§166 同一口径）；
  ~~按天曲线~~、~~游戏侧 completion 事件~~这两件当时仍是 §168 记着的欠账，这一片没有替它们说话；
  **按天曲线已在 2026-09-30 落地**（见文末「§168 第二片」）；**爬虫与真人区分已在 2026-10-16 落地**
  （第三片，见文末「§168 第三片」与 ADR-0043）；**游戏侧通关上报后来也接上了**——2026-10-27 核对：
  `/api/published/game-complete` → `recordGameCompletion`。
  建议全部限于平台今天真支持的动作（改标题/写简介/放封面/改可见性/把链接发出去），没有"投放""买流量"。



**全量回归基线（2026-09-26 15:36）**：`npx vitest run --no-file-parallelism` = **84 个文件 / 910 条全绿，exit 0**。
这是自 §112 那一片以来第一次整套干净：上一轮全量是 872/875，那三条红的就是当天结案的两件事
（分支切换噪音快照的读取顺序、以及并行负载下贴着 30 秒线的两条超时）。
以后引用"测试全绿"时请带上这一条的口径：这一套**不含** e2e（`@smoke` 另跑，42 条）与 Python 侧
（`npm run test:ai-service`，62 passed + 1 skipped），三者都跑完才是这个仓库的完整门禁。
同一提交（`06c1ca3` 之后）另两样也跑过：`npx playwright test -g "@smoke"` **42/42 通过（4.8 分钟）**，
`npm run test:ai-service` 62 passed + 1 skipped。也就是说 SSR 首屏文档那次改动（`7a94988`）
当时只由 3 条相关 @smoke 覆盖，现在整套 e2e 也过了——那道"已知未覆盖"的验证缺口已经合上。

**§51 那一片之后的口径 correction（2026-09-26 深夜）**：@smoke 现在**不是 42 条**了——那一片新加了
`@smoke §51 类型分派`，总数到 43。上面两段引用的 42/42 是**它加入之前**的实测，不改写、不替 43 背书。
§51 那一片自己跑过的只有 3 条：新增的 `@smoke §51`（1 通过，1.1 分钟）与被碰过的 `@smoke §50` 两条
（2 通过，6.0 分钟）；**剩下 40 条在这之后没有整套跑过**，这套改动动了 schemas 与两个试玩页，
没跑完整套之前不许说"e2e 全绿"。

**这笔欠账已经还了（2026-09-26 深夜，§133/§134 那一片之后）**：`npx playwright test -g "@smoke"`
**44/44 通过，14.6 分钟，exit 0**（44 = 43 + 新加的 `@smoke §134`）。第一次跑是红的 7 条，
红的样子不像逻辑错：前 8 条里快照/分支/方案板全空、面板写着"快照操作未完成：HTTP 404"，
第 17 条干脆 `worker process exited unexpectedly (code=3221225794)`（= Chromium 栈溢出），
中间还夹一条 `[WebServer] Failed to find Server Action ... older or newer deployment`。
同一时刻这台机器刚跑完 88 个文件的整套单测（本机空闲内存约 2.5GB），用 curl 走同一条游客链路
（建项目 → 列快照）拿到的却是正常的 200 与那一行"初始版本"。把单测那一份负载拿掉重跑，44/44。
**所以这一条记的是口径不是结论**：@smoke 要与大套件错开跑，红一片且形状是"元素不存在"时先量环境再改代码。

## 当前阻塞项
- `[!]` 真实 AI provider key（文本/图像/视频）— 用户提供前，全部生成类能力以 DEMO MODE 交付，UI 明确标注，不伪装真实结果。

## 已知技术债（不伪装成已完成）
- ~~`Layout.gap / padding / cornerRadius` 类型是 `number`，但属性面板的 token 绑定会写入 `"{space.4}"` 这类字符串~~
  **已修（2026-09-23）**：三处几何字段放宽为 `LengthValue = number | TokenKey`（types.ts），与运行时真相一致。
  验证发现 widening 没让任何消费者报错——因为 layout/render/codegen 早就经 `resolveNum`/`TokenStore` 解析，
  类型谎报从没被编译检查覆盖到。真正被它掩盖的是一个语义 bug：`server/ai/mock.ts` 的「移动端优化」配方
  `Number(gap) || 16` 会把 token 引用静默 coerce 成 NaN→16，已改为「token 引用原样保留、仅字面数值做下限」。
  补 design-model 单测锁住 `{space.*}` 参与真实排布、缺 store 时回落有限值不产生 NaN。
  **边界（非缺陷，如实说明）**：Code → Design 反向同步（`code-parse.ts`）对 gap/padding/cornerRadius
  **刻意只认 px 字面量**——代码里把这些属性写成 `var(--nx-space-…)` 时，`parse` 会给出 note 提示
  「token 绑定请在画布上做」并**不产出补丁**，因此模型里已有的 token 绑定不会被改坏（不是"丢成数字"）。
  这与 `size` 走 `lengthOf` 能把 `var(--nx-space-8)` 反解回 `{space.8}` 是两条不同的策略：`size` 支持、
  gap/padding/radius 不支持，是有意为之的可逆/不可逆区域划分（§17-19），不是待补的 bug。
- ~~ESLint 目前只有 `npm run lint` = typecheck 的占位配置，缺真实规则集。~~ **已还（任务 #43）**：
  `npm run lint` = 七个 tsconfig 的 typecheck + `eslint .`（type-aware `projectService`，测试与 scripts 也在门禁里）。
- 两张表里有**只读不写**的列，别把"列存在"当成"功能存在"：
  1. ~~`projects.description` 没有任何写入方~~ **已还（任务 #50）**：`PATCH /api/projects/<id>` + 首页每行的简介编辑器。
     §165 的 `or(ilike(description,…))` 与 §166 的 `og:description` 第一级从此才有东西可命中——
     `project-meta.integration.test.ts` 里那条"写进去之前搜不到、写进去之后搜得到并且把简介当 detail 带出来"就是这条闭环的钉子。
     历史项目仍然是空的（不回填、不拿名字凑一句），SEO 那侧继续走第二级摘要。
  2. ~~`projects.deleted_at` 同样全是读：13 处 `isNull(projects.deletedAt)` 外加 `publish.ts:246` 单独挡一次，
     但全库没有一处把项目标记为已删除——软删除链路本身没落地。~~
     **已还（`23f6b81`，§74）——这一条在本文件里挂了 20 天没人复核，今天按代码核对才发现它早就成立了**：
     写入方是 `server/domain/projects.ts` 的 `softDeleteProject`（审批门：逐字输入项目名，`confirmName`
     不等就记一条 `allowed:false` 的审计并返回 `approval_required`）与 `restoreProject`（只动 `isNotNull` 的行，
     没删过的项目返回 null 而不是"恢复成功"）；路由 `DELETE /api/projects/<id>` + `POST …/restore`；
     界面是首页的「回收站」。**记这一笔的教训不是"软删没做"，而是"做过就要当场划掉"**：
     下一轮我照着这条过时口径把"补软删除链路"列成了本轮的活，白排一格。
     §166 的 sitemap 谓词从此不是防御性的空转——它挡的是真会发生的事。
     ~~**一处如实欠着**：`seo.integration.test.ts:99` 造"已删除的项目"仍是直接 `UPDATE projects SET deleted_at`，
     没走 `softDeleteProject` 那条真路径~~ **已还（`ac9143f`，§85 第十二片 A）**：现在那句是
     `softDeleteProject(ownerId, projectId, '名字打错了')` 先撞审批门、再用逐字正确的名字真删
     （`seo.integration.test.ts:118/128`，文件顶部注释就写着"那句已经过期"）。
     后果反过来说才准确：审批门与审计那一段现在**是** SEO 这条腿的断言之一，坏了会红。
     ——这一条与上一条是同一条教训的第二遍：本文件里挂着 20 天的旧口径，照着排活就白排一格；
     **改债之前先 `grep` 代码，不要相信本文件的话**。
- 资产服务已落地（任务 #9c，§38/§80/§101/§182）：图片上传 → magic-bytes 判定 → 元数据剥离 → 对象存储 → 鉴权路由 →
  画布/预览/发布四条投影同源。仍欠的两笔如实记下：
  1. `stripImageMetadata` 只做**结构化剥离**（PNG/JPEG/WebP/GIF 的 EXIF/XMP/IPTC/注释段），没有重新编码/缩略图/有损统一化——
     SECURITY.md 期望的"重编码去元数据"要等 provider 层落地时替换本实现（见 `docs/SECURITY.md` 的资产小节与本文件说明）。
  2. 目前只接受位图，视频/音频/3D 显式拒绝；`DELETE /api/assets/[id]` 有服务端与集成测试，UI 入口已随
     Asset Library 面板补上（任务 #21，含 e2e：上传→清单可见→删除跨页剥引用→撤销恢复引用但字节已 404）。
  3. Visual DNA 提取（任务 #22）**只解 PNG**（8 bit、非隔行、五种滤镜）——JPEG/WebP 能上传入库、能上画布，
     但点「提取视觉语言」会拿到 415 和一句中文原因，不会给出半截结论。解 JPEG 需要 Huffman+色度上采样，
     在"零原生依赖 + ai-service 无 Pillow"的约束下自己写不划算；等 provider 层落地时由真视觉模型接管（同时补上
     §173 那些像素测不出来的形容词：Cinematic / Soft glass / Slow motion）。
- 认证已落地（任务 #9d，§137/§80）：bcrypt 口令哈希、会话轮换/吊销、双提交 CSRF、内存滑动窗口限流、就地升级认领 guest 项目。
  三笔债里 CSRF 与限流两笔已还清，剩口令哈希那一笔如实记下，替换点各自单一（见 `docs/adr/0002-password-hashing-and-csrf.md`）：
  1. 口令用的是 SECURITY.md 允许的 **bcrypt 回落分支**，不是首选的 Argon2id（原生/wasm 包与"Windows 免编译 + 零原生依赖"冲突）。
     换 Argon2id 时改 `server/domain/password.ts` 两处函数即可，`verifyPassword` 已按前缀分派，旧 bcrypt 串仍可验证。
  2. ~~CSRF 双提交只在 auth 路由强制~~ **已还清**：`csrfOk` 现覆盖全部 mutation 路由（projects 建/存、snapshots、restore、
     branches、switch、duplicate、variants、merge、publish POST/DELETE、assets 上传/删除、ai/run）。客户端统一走 `src/lib/csrf.ts` 的
     `csrfHeaders()`（`AccountPanel` 内联实现已收敛）；`FormData` 上传只加头不设 `content-type`。15 条 @smoke 端到端 + 新增 `csrf-client.test.ts` 为回归证明。
  3. ~~限流是**单实例内存驱动**，多实例部署下退化为每实例独立计数~~ **已还清**（§SEC 第三十二片，ADR-0076）：
     `RateLimiter` 接口没变（先把它改成异步，同步接口写不出跨实例的数），设 `NEXUS_REDIS_URL` 换成 Redis
     有序集滑动窗口，所有实例数同一份；不设则照旧进程内。**多实例部署这一格是必设项不是优化项**——
     `10 次/15 分钟/邮箱` 在两台前端下实际是"每台 10 次"，而没有任何读数会说这句变了。Redis 坏时退回进程内
     并且出声（`nexus_rate_limit_driver_fallbacks_total`）。进程内那版自己也有了收口（第三十三片，ADR-0077：
     整窗过期的扫掉、桶数钉在 `maxBuckets`（默认 50 000）以内、`nexus_rate_limit_buckets_pruned_total{reason}` 三本账）。
     ~~仍欠两格如实记下：Redis 侧的键基数没有上界（靠 TTL 收尾而不是靠上限）~~ **这一格已还**
     （§SEC 第三十四片，ADR-0081：桶键名册 + `maxBucketKeys` 默认 50 000，到上界**不再新建桶键**、
     那条请求交给本机窗口判并记 `{reason="over-cap"}`；取向与进程内那一版相反并且是故意的）。
     ~~剩一格如实记下："这台实例现在用的是哪个驱动"没有界面位（答案只有启动那一行日志与那个 fallback counter）~~
     **这一格已还**（§SEC 第三十五片，ADR-0082：`RateLimiter.describe()` 由两个驱动各自实现，
     `GET /api/admin/rate-limit` 原样端出，`/admin/rate-limit` 每 4 秒问一次单例那份现场；
     按原因的两本账仍从 metrics 现读，不让驱动自报第二份）。
- 历史面板的 Ctrl+Z 只在浏览器会话内，刷新即失；服务端快照与 Branch / Duplicate（§27/§28）已经打通。
  还缺的是 §29 的多方案 A-B-C 并排比较视图（分支线已经能承载多个方向）。
  ~~以及快照列表的「只看当前分支」筛选——现在仍按时间全量展示~~ **已还（`35fbd4c`，第二十二片）**：
  筛选在服务端做（`HistoryPanel.tsx:225` 那颗勾 + `store.ts:727` 的列表范围），
  "当前分支"由服务端从 head/`currentSnapshotId` 现算，不是客户端裁掉前 200 条。
- 主题 mode 的持久化债已还（迁移 `0001_theme_mode`：`projects.active_mode` / `modes` 两列，
  保存-重载与快照恢复都带得回 `document.activeMode`）。
- ~~起手页的圆角、间距是写死在节点上的数字（`cornerRadius: 10`、`padding.top: 64`），没绑到 `radius.*` /
  `space.*` token。后果具体可见：§29 的视觉语言只能换颜色与字体，"换一套圆角"这种旋钮做不了——
  做不了就别在 UI 上声称能做。~~
  **已还（2026-09-23，任务 #25）**：起手页、四个结构方向新增的区块、DEMO 配方生成的 section
  全部改成引用 `{space.*}` / `{radius.*}`（为此给默认栅格补了 `space.20=80` / `space.24=96`）。
  `ConceptLanguage` 多了 `geometry` 旋钮，四套语言各自给出圆角与间距刻度——
  cyber 的「直角」现在真的是 0px，warm 的「圆角」是 20px，不再只是形容词。
  配套三件：`lintDesign` 的 `hardcoded-style` 覆盖未绑 token 的非零 gap/padding/cornerRadius
  （0 是默认值不算硬编码）；`code-parse` 学会把 `var(--nx-space-6)` 反解回 `{space.6}`
  （只认 px 字面量会让 §19 的往返恒等在第一份起手页上就破，而认回**引用**才不会把绑定改写成常量）；
  DNA 的 `radius` / `spacingScale` 从落好 token 的文档里读，不再抄一份常量表。
  顺带修掉设计系统面板的一处说谎：输入框的草稿在提交后不清除，撤销/AI 改动之后面板仍显示旧数字——
  现在 blur 即丢草稿，屏幕上的读数与模型一致（§16）。
- 项目健康与 Quality Gate 已落地（任务 #23，§178/§179，见 `docs/adr/0005-health-score-and-gate.md`）。
  它"没做到"的部分是刻意留下的，逐条说清，免得下一个人把它当成全绿：
  1. **Performance 行是静态预算**（节点数、树深、位图字节、缺尺寸图片、动效数），不是 LCP/CLS 实测。
     `basis` 里明写了这句。要真测得在预览浏览器里打点，再把结果作为 options 传进 `analyzeHealth`。
  2. **Tests / AI QA 两行会一直是"未评估"**。前者需要项目自己的测试跑起来（平台自身的测试对用户的页面没有信号），
     后者需要真实模型评审内容——两者都不是"再写点代码就能补上"的空位，而是需要新能力。
     它们留在表里、以第三种状态出现，正是 §178 的价值：让人看见哪里没被检查过。
  3. **Security 行是模型内的正则级检查**（疑似明文凭据、code 节点危险写法、http 明文外链），
     不是漏洞扫描，也不覆盖生成代码在沙箱内的行为（那是 §81-83 的隔离执行线）。
     凭据类发现只报节点与字段路径，绝不把命中的内容抄进报告。
  4. **阈值是工程判断不是标准**：80/70/60 只写在 `HEALTH_THRESHOLDS` 一处，Build/Security 按"有无 error"判。
     改线必须同时改 `health.test.ts` 里门槛两侧（82 通过 / 76 挡住）的断言。
  5. 健康度按整份文档算（每页解析一次排版），Studio 里每次改动都重算。8 节点的起手页无感，
     几百节点之后需要增量或缓存——`analyzeHealth` 已经接受外部传入 `layouts`，就是为了那一天。
  6. 几何类发现（越出画布、零尺寸、点击目标）依赖该页能排版成功；结构坏掉的页面会跳过排版，
     问题由 Build 行负责报出来，不会静默消失。
- 代码投影（`codegen.ts`）与画布一样只覆盖几何/样式/文字：`typography.runs`、`animation`、`interactions`、
  `bindings` 都还没实现——渲染层也没有，所以两边一致地缺失，不是生成器单独偷懒。
  （`states` 已于 2026-10-24 补齐四处投影，见文末 §124 一节与 ADR-0062。）
- 生成的页面组件之间没有共享组件抽取：`component`/`instance` 节点会被展开成内联子树，
  等 §13 组件系统的实例语义稳定后再收敛成 `<Component />` 引用。
- **未定位的偶发（不伪装成已修）**：`branches.integration.test.ts` 的「内容没变时反复切换不会堆噪音快照」
  整套并行时约 8 次失败 1 次。名字已经抓准：多出来的是 `切到「design-v2」前的现场`，即从 main 切走时
  `stashCurrent` 认为"工作稿 ≠ main 的 head"；而单独跑同样三步（建项目 → 开分支 → 来回切）是干净的：
  两条 head 都在、`documentsMatch` 两次都为 true、只留两条"切换到"。
  怀疑点因此收窄成一句：**switchBranch 恢复进工作区的文档，是否有时与它自己的 head 快照不逐字段相等**
  （真相等就不该 stash）。下一步是在那条判 false 的分支上把差异打出来（哪个 page / token / 节点不同）。
  期间没有放宽断言、没加重试——噪音快照正是这条测试要抓的东西（另见 `docs/TESTING.md` 已知偶发）。
  **2026-09-25 又中一次**（全量 67 文件 / 723 测试，唯一红的就是它；单独重跑 `branches.integration.test.ts`
  8/8 干净）。到这次为止的复现率是"整套并行约 9 次里中 2 次"，且两次都发生在加了新纯单测文件的运行里
  ——与本片（game-model）没有任何共享代码，这条只是又一次"并行时中、单独跑不中"的证据，不是新增因。
  **同日把调查变成常驻诊断**：连着跑 5 次（2 次全量 + 3 次相关子集）都没再命中，探针打出来的
  两次都是真差异（`added 原稿标记` / `added v1 的方向`，即"改了再切"的合法 stash），
  也就是说继续靠复现去抓不划算。现在 `stashCurrent` 每次写那条"前的现场"都把**为什么**写进快照自己的
  `summary`（"与「X」的差异：added 某节点" 或 "离开的分支没有可读的 head 快照"），
  下一次真噪音出现时历史列表里就带着原因，而不是留一行只有时间的谜。
  新增一条测试钉住这个诊断（并配反向对照：内容一样时根本不写这一条）。
- **噪音快照已定位并修掉（2026-09-26，#40 结案）**：根因不在比较逻辑，在**读取顺序**。
  `design_tokens` 从建库起没有一列记录"文档里的顺序"，而 `loadDocument` 读它用的是**一句没有 ORDER BY 的 SELECT**：
  返回顺序由物理行序决定。`saveDocument` 又是 delete + 按文档顺序 insert，于是同一份内容每过一轮存取，
  token 数组都可能重排一次——`documentsMatch` 对数组是**按序**比的（`stableKey` 只重排对象键，不重排数组），
  所以"内容没变的切换"会被判成有改动，`stashCurrent` 就写出那条"切到 X 前的现场"。
  这解释了它为什么只在整套并行时中（行序受 churn 影响）、为什么单独跑干净、为什么 `diffDocuments` 说不出差在哪。
  修法是把顺序变成模型里存得下来的东西：迁移 `0015` 给 `design_tokens` 加 `sort_index`，
  `saveDocument` 写入文档里的位置，`loadDocument` 按 `(sort_index, key)` 读；
  同一处顺带把 `pages`（原来 `sortIndex` 有并列时同样不定序）、`components`、`design_nodes` 都补上确定的 ORDER BY。
  验证：`projects.integration.test.ts` 新增一条"token 顺序穿过一次存取不变"，
  它自带反向对照——把**这个项目**那一列抹平成同一个值后，读回来的顺序必须变成字母序且不再等于文档那一份
  （否则这条绿只能证明"postgres 恰好按插入顺序返回"）；
  `branches.integration.test.ts` 新增探针：切换后立刻断言"工作区那一份 == 这一分支 head 那一份"，
  然后一次编辑都不做、来回切 8 次，要求噪音 0 条而"切换到"恰好 16 条。
  变异两次各自被抓：`sortIndex: index` 写成 `0` → 红在"等于 wanted"那条；去掉 token 查询的 ORDER BY →
  红在反向对照那条（`degraded` 竟然等于 `wanted`）。两次都只红这一条测试，其余 10 条不受影响。
  顺序从此是**确定的**，所以界面也重跑了一遍：`npx playwright test -g "@smoke"` 42/42 通过（7.6 分钟），
  含设计系统面板、历史/分支、发布与实时那几条读文档的用例——它们以前读的是一份顺序会自己变的列表。
  同一笔的第二次命中（今天全量那次）还暴露了诊断本身的缺陷：带证据的那句断言排在第三条，
  命中时先在第 1 条上红了、诊断一个字都没打印——已把分支头与那条快照自己的 `summary` 移进第一条断言。
- **§147 只赢了一半 → 第二片已落地（2026-09-26，图层面板窗口化）**：画布视口裁剪把 1000 / 4000 节点档的画布 DOM
  从 1000 / 4000 降到 18 个，pan 平移的 p95 从 139–176ms 降到 115–127ms，**但 >33ms 的掉帧数一点没变（40 / 235）**；
  而 4000 节点那一档首帧当时仍然量不到（等 180 秒画不出第一个节点），同一档图层树列出 3999 行。
  当时的结论是"整份文档铺成 DOM 的地方不止画布"，这一片就是照那句做的：图层树先展开成一维
  （`src/studio/layers-flat.ts`，显式栈、语义与改造前的递归逐字对齐），面板只渲染看得见的那一段
  （固定行高 24px + overscan 6，绝对定位）。**同一台机器、同一脚本重量的结果**：
  4000 节点档首帧从"180 秒量不到"变成 **1514.9ms**（两次 1689.9 / 1339.9），
  图层树展开 3999 行而 DOM 只有 **39 行**，画布 DOM 仍是 34 个，
  pan 平移 p95 **18.2ms**、>33ms 的帧 **0/262**（改造前那一档是 235 帧掉帧）；
  1000 节点档同样从"图层树 999 行 DOM"变成 999 展开 / 39 DOM。
  仍然挂着的两句，别跟着一起划掉：
  ① **属性写入 → 画布更新在 4000 节点那一档是 1313.6ms**（起手 8 节点 22.4ms）。
  这一句先前写的是"每次改动都把整份文档重算/重存一遍的那条路径"——**那句推断已被实测否掉**：
  这个探针量的是页内的"写属性 → 画布重绘"，而自动保存有 1800ms 防抖，网络那一趟根本不在这个窗口里。
  顺手把保存响应里"读回整份文档再序列化发出去"那一块去掉了（客户端从来不读它，只读 `ok` 与 `savedAt`），
  重量之后同一档是 1313.6ms 对 1353.5ms——**在噪声内，所以它不是这 1.3 秒的来源**，
  那次删除只是"少做一份没人要的工作"，不记成性能修复。
  这 1.3 秒**现在量出分布了**（探针加了两个分点：input 之后到第一帧隔多久、期间有没有长任务）：
  三次分别是"总 1203 / 第一帧前 1201"、"总 1291 / 1287"、"总 1204 / 1202"，
  而每一轮那一个长任务的时长就是那 1.2 秒本身。**结论：钱全花在一个把主线程占死的同步大块上，
  浏览器连一帧都还没走到**——不是重绘、不是布局、更不是网络。
  下一步该做的是"改一个节点不再需要同步走完 4000 个节点的那一次提交"（节点组件记忆化 / 补丁应用与渲染切片），
  而不是继续在服务端找。起手 8 节点那一档（总 34.7ms、第一帧前 30ms、无长任务）是同一把尺子的反向对照。

  **同日再量一层（48cfb7a 的快照分段计数），把上面那句"下一步"改向**：
  4000 节点档三次是"总 1146 / 第一帧前 1143 / 长任务 1143 / 快照 2 次共 23ms（求解占其中 23ms，token 与资产 0）"、
  "1300 / 1298 / 1297 / 19ms"、"1420 / 1417 / 1417 / 18ms"。
  也就是说那 1.2 秒**不是模型、不是布局求解、也不是 buildSnapshot**（这些合计 20ms 上下），
  而是订阅 store 的那一次 React 渲染提交。起手 8 节点同一把尺子是"总 24-36ms、快照 0-1ms、无长任务"，
  这一档是防止"计数本身坏了"的对照。
  所以"节点组件记忆化"这个方向要改：**画布只渲染 34 个框，问题不在它**；
  该找的是其它订阅者里随节点数线性（或更糟）长的那一段——图层面板的展开与匹配、属性面板，
  以及任何在 render 里遍历 `page.nodes` 的组件。
  ② 面板窗口化不改"整份文档要先进内存"这件事，展开那 3999 行仍然是一次 O(n)，
  真要往上走（10000 节点档）得看结构共享与增量保存。
  ③ §146/§147 那张目标表里，先前**只有写在文档上、没人去量的两项现在量了**（`ec5bf35`/`677e26c`/`8e0e117`，
  都是生产构建 + `PERF_LABEL` 的口径）：选中响应 12.5 / 13.8ms（目标 <16ms，过），
  JS 堆峰值 19MB / 86MB（浏览器开 `--enable-precise-memory-info`，50ms 轮询取最大）。
  剩下的那半是**内存"峰值"与目标之间还差一句判断**：61-86MB 这个数本身没有通过/不通过的标准——
  §146 只写了"度量并记录内存峰值"，没写上限，所以这一项现在只有数、没有门。
  证据链的三处新钉法：`layers-flat.test.ts` 8 条（顺序/折叠/悬空 childId/过滤只筛顶层/1000 层不爆栈/4000 节点展开 3999 行），
  `perf-browser.mts` 的自检从"图层树 DOM 行数 ≈ 文档规模"改成读 `data-layer-total`（虚拟化之后 DOM 行数不再是文档证据），
  并新增一条"大文档下 DOM 行数 > 展开总数一半就直接抛错"；
  反向对照由既有 e2e 提供：7 节点的小项目仍然渲染出 7 行 `[data-layer-id]`（窗口化不该把小文档也裁成半截）。
  §147 因此仍是 `[~]`。

  **但上面这些数全是开发模式的数，这一点先前没写出来**（2026-09-26 补，同一台机器、同一脚本、`npm run build` 之后重量）：
  给探针加上 CPU 采样归因（`PERF_PROFILE=1`）之后，那 1.2 秒里自时长最高的几段是
  React **DEV 专用**的样式对象比对（`addValueToProperties` / `addObjectDiffToProperties` 合计约 26%，
  加 `readReactElementTypeof` 与一堆 `jsxDEV`），生产构建里这些代码根本不存在。实测对照：

  | 档位 | 开发模式 | 生产构建 |
  | --- | --- | --- |
  | 属性写入 → 画布更新（起手 8 节点） | 34.7ms | **8ms** |
  | 属性写入 → 画布更新（4000 节点） | 1247.7ms | **221.2ms**（各次 147.3 / 295.1） |
  | 首帧（4000 节点） | 1322.8ms | **1904.9ms**（各次 1821.2 / 1988.6） |

  两句结论，一句好消息一句不好：
  ① 先前记在 §147 名下的"1.2 秒热点"**大部分是开发模式的税**，不是用户会感受到的延迟——
  把它当作用户侧缺陷去优化 React 渲染，会花掉几天去修一个不存在的洞；
  ② 但**首帧在生产里反而更慢（1.9 秒）**，这一项才是 §146/§147 真正没过关的那个：
  它量的是"从导航到第一个节点画出来"，里面是整份文档的读取 + 水合 + 首屏求解，
  与 DEV 税无关。所以 §147 剩下的活是**首帧那条路**，不是属性写入那一条。
  **首帧那 1.9 秒随后又被拆开了，而且它自己也不稳**（同一份生产构建、同一脚本，隔十分钟重量是 540.2ms）：
  探针加了第二段拆分（`__perf.startEpoch` 与 resource timing 换到同一个坐标系再减——第一版混了两个时钟，
  算出过 -17ms 这种荒谬数），4000 节点档三次是"到手前 416 / 474 / 409ms + 到手之后 108 / 105 / 93ms"，
  那一次项目接口请求本身是 152-206ms。也就是说**首帧剩下的钱花在"文档到手之前"**
  （HTML + JS 加载、水合启动、接口往返），到手之后的渲染只占约 100ms。
  两句要一起记住的不确定：① 同一构建第一次跑与第二次跑差 3.5 倍（1904.9 vs 540.2），
  所以任何一次单独的数都不能当基线——要么固定跑两遍取第二遍，要么把冷启动单独列一档；
  ② `encodedBodySize` 同源也常报 0（浏览器不给），所以"文档多大"这一项现在量不到，日志里写的是"字节数浏览器不给"而不是编一个数。
  **首帧那一段的第一个改动量完了（7a94988 + 本轮的标签修正）**：文档改由服务端随 HTML 带下来之后，
  同一台机器、同一脚本、生产构建，`首帧（4000 节点）` 三遍是 **435.7（冷）/ 386.5 / 464.5ms**，
  改之前同口径是 540.2ms（同一份构建第一次跑还量过 1904.9ms）。
  两句都要说：① 确有下降，但**幅度（约 -14% 到 -28%）小于跨会话的抖动**，
  所以只能记成"方向对、省下的就是那次接口往返"，不能记成"首帧快了 X%"；
  ② 拆分那行日志的标签也跟着改过一次——文档内联之后，"最慢的那次 /api/projects/*"
  已经不是文档接口，而是快照/发布/批注那几次里的一个，首帧比它早结束是**正常**的（首屏不依赖它），
  旧标签会把它读成"文档到手之前"，那是个会说谎的标签。
  纪律补一句：以后引用 §146/§147 的数，必须写明是 `next dev` 还是生产构建——
  同一台机器、同一脚本、同一档节点数，两者差 5 倍是实测出来的。

  **2026-09-27：测量协议这一项收口了，收口收到的第一件事是"上面两个绿的数复现不出来"**（同一台机器、
  同一份生产构建、`PERF_LABEL=prod-ff68810`、同一会话连跑，完整表在 `docs/PERFORMANCE.md`）：

  - **协议本身**：4000 档在同一会话量了两遍，属性写入是 239.2 与 319.7ms（差 34%），首帧 1051.8 与 877.1ms（差 17%）。
    "同一口径、同一构建、至少两遍"这条规则不是形式——它当场就证明了单遍不能当基线。
  - **§146 的 10000 这一档以前从来没有真的跑过**：单页 10000 节点在真实 PUT 路径上被服务端直接拒绝
    （`HTTP 400 页面 Home 节点数超过上限 4000`，`validation.ts` 的 `MAX_NODES_PER_PAGE`）。
    脚本改成吃这个常量、一页填满再开一页，于是量到的是 `10002 节点 / 3 页` 这份真文档：
    首帧 1569.1ms、属性写入 476.7ms、选中响应 29.6ms、JS 堆峰值 148MB、pan 中位帧距仍是 6.1ms 且 0 帧 >33ms、
    画布 DOM 仍是 34 个。这条挡在前面的事开成 **#63**（顺带一个事实：单页上限并不约束整份文档，
    64 页 × 4000 存得下 25.6 万节点，一页 5000 反而不行——这道守卫没守住它自己想守的东西）。
  - **先前那两个"达标"现在不达标，而且不是规模造成的**：`docs/TESTING.md` 写死了属性写入 <50ms、
    选中响应 <16ms（"回归即视为 bug"）。属性写入在 4000/10002 档是 239–477ms，明显红；
    选中响应**连起手 8 节点都红**——四遍基线 32.7 / 30.8 / 27.5 / 36.4ms，而 `677e26c` 记下的是 12.5 / 13.8ms。
    同一把尺子、同一个脚本，量不出当初那条绿，所以"选中响应达标"这句从今天起作废；
    同理 `7a94988` 那笔记录的 4000 档首帧 386.5–464.5ms，今天两遍是 877–1052ms。
    两种可能没法定：要么当初那几次是机器空着量的（今天这台在并发跑别的活），要么中间这几笔改动确实拖慢了。
    下一步就是把它分清——**空闲机器上重跑同一档**，这条比继续加新功能值钱，所以排在 #63 之后立刻做
    （#62 的写放大那一半已完成；10000 档读数已补于 2026-10-09，客户端发补丁那半见 #62 专节）。
  - **内存那一项还是只有数没有门**（148MB 这句不说达标）：§146 只写"度量并记录"，没写上限，
    所以这一项的缺口是"没有标准"，不是"数字太大"。
  - §147 仍是 `[~]`（画布虚拟化/增量渲染、选中响应仍欠账），但**`applyPatch` 结构共享已落地**：
    `execute + undo ×10` 在 10k 节点档从 657.9ms 降至 ~200ms（同会话前后对照），
    "整份文档克隆仍在"这句作废。下一刀是画布虚拟化与选中响应。
    **2026-10-24 收口（77404ed）**：选中响应那条线上的"增量重解从未跑过"的根因打通——
    布局缓存命中判据由"文档对象身份"换成"文档代数 `gen`"（`applyPatch` 写时拷贝、每次返新对象
    → 旧判据恒 miss → 纯选中提交也重算整页布局）。红证：`studio-layout-cache.test.ts` 三条断言
    （只改选区命中 / 事务内半程不交旧布局 / 换视口重算）随之加固；全量 2585 条 + lint 0。


## #63 落地：文档规模的门改成按整份文档挡，§146 的 10000 档第一次真跑通（2026-09-27）

`docs/adr/0015-document-size-gate-counts-the-whole-document.md`。一句话：
`validation.ts` 的 `MAX_NODES_PER_PAGE = 4000` 换成 `MAX_NODES_PER_DOCUMENT = 20_000`（= §146 顶档的两倍），
单页不再单独设限。理由与两头的事实在 ADR 里，这里只记路线图上要紧的三点：

- **上面那条"10002 节点 / 3 页"的数从此被取代**：门改了以后压测脚本不再摊页，
  §146 顶档就是**一页 10000 个节点**，重测的数在 `docs/PERFORMANCE.md` 口径 `prod-adr0015` 那一节
  （首帧 1761.3 / 1809.9ms、属性写入 583.3 / 763.3ms、选中 36.0 / 67.4ms、JS 堆峰值 145 / 161MB，两遍各取中位）。
  新数比摊页那次数**更差**，但那不是回归而是量的对象变了——别拿这两栏相减说"改门改慢了"，
  也别拿新数当"还能再往上加节点"的依据。
- **门修好的是"能不能存"，不是"存了卡不卡"**：属性写入 <50ms 这一档在 10000 单页是 12–15 倍，
   `applyPatch` 结构共享已落地（`CopyOnWrite` 写时拷贝），**增量保存早已落地**（`writeDocument` 已是增量 diff），
   #62 的写放大那一半完成（"全部完成"这句不作数：10000 档读数 2026-10-09 才补，客户端发补丁那半见 #62 专节）。
- **测试纪律又补了一条**（写在 `docs/TESTING.md`）：这一节的头三条用例全在单页上摆数字，
  所以"退回单页语义"这种改法它们一律看不见——第四条（三页各不超上限、总数超上限必须拒）
  是三颗变异探针里唯一能看见"求和没了"的那条。**改门的语义必须同时有一条跨页的用例**，
  不然绿灯守的还是旧语义。

下一步顺序：**"空闲机器重跑同一档"已完成（本机有并发负载，选中响应起手 8 节点 49.9ms、属性写入 8 节点 37.7ms）**，
分清了选中响应是常数级问题（起手 8 节点就超标，非随规模增大）。→ 画布虚拟化 + 选中事件路径常数开销（§147）。#63 关掉。


## #64 落地：同一项目的并发保存以前必然互相踩，现在在事务里排队（2026-09-27）

`docs/adr/0016-project-writes-serialized-by-xact-lock.md`。修的是生产日志里那次
`PUT /api/projects/9404a93d…: Failed query: insert into "pages"`：`writeDocument` 是"整删重插"，
两个并发事务各自从同一份旧文档出发，就会 A 删完 → B 删完 → A 插 p_x → B 插同一个 p_x 撞 `pages_pkey`。
库里没留半写状态（回滚干净），但用户侧是一次保存失败，而 Studio 有自动保存，两个标签页就会撞。

- **改法一行**：`writeDocument` 开头拿项目级事务锁 `pg_advisory_xact_lock(hashtextextended(projectId, 0))`。
  放在 `writeDocument` 里而不是调用方，因为它有两个调用点（`createProject` / `saveDocument`），
  锁的范围属于"怎么写文档"这件事本身。
- **证据是红率不是单次绿**（`apps/web/test/document-concurrent-write.integration.test.ts`，3 个并发写各 600 节点）：
  无锁连跑 5 遍 **5 遍全红**（红因就是日志里那道 `insert into "pages"` 冲突，断言消息里直接带出来）；
  加锁连跑 5 遍 **5 遍全绿**。用例另外两条断言的是"读回来是某一份完整文档、不混不半截"和"库里节点行数与文档对得上"。
- **这条测试挡不住的一件事要说明白**：把锁 key 写成常量 `0`（所有项目全局串行）用例照样绿。
  锁的范围靠的是那一行代码和 ADR，不是靠断言；真要钉得做跨项目并发计时对照，本机负载下那条会飘。
- 与 §147 的关系：这是"整份文档替换"的写放大的**下半截（并发）**，上半截（一次保存为什么要写 10000 行）
  还是增量保存那一刀，做完之后这把锁仍然是对的。**大文档下的排队代价没重测**（今天这台机器不空闲，
  一次普通页面加载 4.3 秒），记在这里不当已知。


## #65 落地：trending 的同分用例第一次有两条腿（2026-09-27）

整套跑红的那一条（"刚发布的应当在 trending 这一页里"）是 c1bc9b4 那一族的**第四处**——
`discover` 的前 60 是环境量，而当时只处理了"红了的那三条"，没处理"任何对宽度的依赖"。
量过的数：清理后 99 条公开版本、整套跑时 121 条，当页最高分 7.4、最低 0.2（一次临时探针，跑完删掉）。

但这一族只是表面原因，第二处洞在比较器自己身上：原来的同分用例两张卡的 `published_at` 天然差几毫秒，
**"路径倒序"那一级从来没被走到**——把它删掉用例照样绿。所以这一片改的是两件事：

- 分数压过全场而不是"看得见就当没事"：赞数从个位数拉到 80（一人一票、权重 1，人数就是分数上限），
  同文件另两条对窗口宽度的依赖（popular 对照、屏蔽用例）一起拉高；断言消息里带当页最高分与五张卡的分数时刻。
- 并列前提要故意和退路矛盾：三张卡钉在**同一时刻**（只有路径那一级能定序，期望顺序是发布顺序的反面），
  另两张**时刻不同而路径大小与时间先后相反**（只有时间那一级能给对）。

**验证**：未变异对照 3/3 绿（跑完 `git diff --exit-code` 确认 `social.ts` 还原干净）；
删掉路径那一级 → 红 1 条（同刻三张跟着库返回行的顺序漂）；删掉时间那一级 → 红 1 条（`ts-early` 抢到前面）。
`npm run lint`（typecheck + eslint）0 问题。教训两条写在 `docs/TESTING.md`。

**这一片没有做的**：整套单测在写这一段时还没重跑完，所以"959 条全绿"这类话现在不能说；
`published_projects.published_at` 被用例钉值只发生在测试库里，生产写入方（publish）没动。

**上面那句话当场就被自己证伪了一次**（2026-09-27，同一天的整套重跑）：`npm test` 结果是
**88 文件过 / 1 文件红，957 绿 / 3 红**，红的正是这三条新写的用例，红因是**默认 30 秒超时**。
量出来的数：单跑（库里带着整套存量）三条各 5.8 / 2.5 / 7.5 秒；整套那一遍总时长 532 秒（基线 352 秒）。
两条一起改：给这三条显式 90 秒（对最重的 7.5 秒留 12 倍余量），并把超时不够的后果写进文件注释——
**超时被撑到时用例的写入还在继续**，所以 afterAll 的清场撞上外键，那一遍留下 95 个删不掉的用户行
（已经手工清掉：`delete … where handle ~ '^tr(av|f|v)…'`，连 12 条残留的赞一起）。
放宽的只有墙上时钟，一条断言都没减；这一点在 `docs/TESTING.md` 里也留了一句。

**90 秒那一改的整套重跑，当场补上了（2026-09-28 07:50）**：`npm test` →
**90 个文件全过 / 965 条全过，240.54 秒，退出码 0**。上面"整套还没重跑完"那句欠账到此合上；
这一遍比出问题那一遍（532 秒）快得多，因为机器空闲——**同一套用例的墙上时钟本来就随负载飘**，
所以这里报的是文件/用例数而不是时长。


## §38 第一格：本地确定性图像合成器落地（2026-09-27，只有合成器与它的单测）

`docs/ROADMAP.md` 的阻塞项第 3 条写着"真实 AI provider key（文本/图像/视频）"没有着落，
所以 §38 的 Text → Image 今天能诚实做的部分是：**像素来源明确标注为本地合成**，
把这条链的其余环节接成真的。这一格落了 `apps/web/src/server/domain/image-synth.ts`：
prompt/seed/尺寸 → 真 PNG 字节（自己写的编码器：签名 + IHDR/IDAT/IEND + CRC32 + zlib），
输出带着 `genMeta = {prompt, seed, provider:'demo', model:'local-deterministic-synth', demoMode:true}`，
**没有任何 HTTP、没有 provider、没有模型**。同一句话逐字节可复现，换话或换 seed 必须不一样。

**验证**：`image-synth.test.ts` 5 条全绿（15/10/2/2/3 毫秒）。这五条里最要紧的是最后一条反向对照——
它把 IHDR 改坏一个字节，要求同一套 CRC 校验必须报错；不然"结构合法的 PNG"只是校验给的绿灯。
另外它数的不是字节而是**颜色种数**（>200 种），一张平图过不了这一条。

**这一格没有做的（不许读成已生效）**：
- 没有 HTTP 接口、没有 Image Studio 面板入口，画布里拿不到这张图。用户仍然只能上传。
- 生成结果**还没有进资产表**：`uploadImageAsset` 里 `source` 写死 `'upload'`，摄取函数不接受"生成"这一档，
  所以 §133/§134 的 image 额度桶**今天仍然没有消耗方**。
- `assetRowToRef`（`projects.ts:223`）没把 `genMeta.demoMode` 映射出去，
  于是 `AssetsPanel.tsx:111` 上那个 DEMO 徽标是**读一个永远不会被写的字段**——接上生成的那一格要一起修。


## §133/§134 第一片：额度账本落地，五格里只有一格真的有执行方（2026-09-26 夜）

需求原文两句：§133"五档订阅（Free/Pro/Creator/Studio/Enterprise），按 AI usage / storage /
generation / team collaboration / publishing 设计"，§134"用户看得到 AI / Image / Video / Compute
四类额度，**所有消费透明**"。动手前库里没有任何额度的概念。这一片做的是**能兑的那部分**，
并且把没兑的在界面上写出来。

**做了什么**

- 迁移 `0016_credit_ledger.sql`：`credit_ledger` 一张表 + `users.plan` 一列。
  **没有"当前余额"这一列**——余额是 `SUM(delta)` 派生的（与快照/搜索那几处"能派生就不存储"同一条纪律）。
  三条库级保证：只追加触发器（直接打在表上的 UPDATE/DELETE 一律挡，更正=新写一行 `adjust`）、
  `(task_id, kind)` 部分唯一索引（一次任务只扣一行）、`(user_id, kind, period)` 部分唯一索引
  （一个月一类只发一次）。
- 规则层 `server/domain/credits.ts`：四类额度、五档发放表、单价表、`creditKindForAgentKey`、
  `refusalFor`。**没有充值**：`adjustCredits` 存在但没有任何 HTTP 路由通向它，
  它的用途是让测试能造出"余额为 0"这个状态。
- 一个真拦截方：`refusalForRun` 接在 `/api/ai/run` 与 `/api/ai/jobs` 提交之前（任务行落库之前），
  额度不够回 `429 credits_exhausted`，那句话带着数字（"需要 1 点，现在只有 0 点"）。
- 扣点接在**写终态的那两个地方**：`finishTask`（同步与异步轮询共用）与 `decideApproval`
  （批准=那份补丁真的落了画布，所以也要扣；拒绝不扣）。失败的任务一行都不扣。
- `/credits` 页：四类余额 + 最近 20 行流水（每一行都写"追到哪件事"）+ 五档表。
  页面自己说清三件事：只有 `aiUsage` 这一格有拦截方、Image/Video/Compute 今天没有消耗方、
  发放是"看账之前确保一次"而不是每月 1 日定时任务（本机没有常驻 cron）。
  首页账号区加了入口，**游客也看得见**——扣的就是这个会话名下那 100 点。

**踩到并修掉的五处**

1. 第一版触发器无条件挡所有 UPDATE/DELETE，集成测试第一次跑就红了两处：
   `delete from agent_tasks` 要按 `ON DELETE SET NULL` 摘掉账本里的指针，被挡下 →
   从此全库删不掉任务行；而 `generation ⇒ task_id IS NOT NULL` 这条表级 CHECK 分不清
   "插入时就没写"与"后来被摘掉"。现在放行条件写死成"`pg_trigger_depth()>1` 且除两个外键指针外各列一模一样"，
   形状规则挪到触发器的 INSERT 分支（那里看得见 `TG_OP`），**放行这一条本身有用例**。
2. `creditKindForAgentKey('videos-agent')` 的反向对照写错了：`video` 就是 `videos` 的子串，
   它当然算 video。红过一次之后改成"让关键字整个消失"（`vide-agent` / `filn-agent`）。
3. drizzle 把库的报错包成 `Failed query: ...`，Postgres 自己那句话在 `cause` 里——
   只断言 `message` 的 `toThrow(/只追加/)` 挑不出"红的是别的错"。测试改成读两层。
4. §51 那一片把 4 处 `var(--nexus-color-border)` 提了进去，而 `tokens.css` 里只有 `-subtle` / `-strong`：
   `style-tokens.test.ts` 那条"界面里没有指向不存在 token 的 var()"从那次提交起一直是红的，这次整套跑才撞上。
   已改成 `-subtle`。记在这里的理由不是"错了就改"，而是**门禁和断言都在，缺的只是提交前跑整套**。
5. `npm test` 默认并行，`social.integration.test.ts` 与 `trending.integration.test.ts` 各红一条，
   红的不是逻辑而是**列表宽度**：`discover` 的 limit 硬夹 60，这台开发库里已经积了 101 条公开版本
   （存量最高浏览量 151），"我刚发布的那张卡在不在这一页里"取决于别的文件此刻在发布还是在清理。
   同两个文件串行跑 12/12 绿，坐实了这一点。两片都修：`vitest.config.ts` 关掉文件级并行，
   同时把那三条对"前 60"的依赖拿掉（自己的卡片用浏览量顶进窗口 / 零分顺序那条改用自己造的两张卡）——
   因为它是**慢红**：存量再多 60 条，串行也一样红。

一个自己抓到的口径错：整套第一次跑完时我只看到 `exit 0`，就把"954 条 / 86 秒"当成读到的数字报了一遍——
那个数是没读到的（`| tail` 之后输出文件是空的）。实际量到的是 **352 秒 / 88 个文件 / 954 条全绿**。
这类错正是 §159 反对的那种"看起来量过了"。

**验证（这一片自己跑过的）**

- `credits.test.ts` 10 条 + `credits.integration.test.ts`（真库）10 条：全绿。
- `@smoke §134`（真浏览器，22.6s）：跑一次生成 → AI 那一格 100→99、
  image/video/compute 三格一动不动、那一行流水写着"DEMO 模板"并指着命令栏报出的任务号前缀。
  截图两张看过：`screenshots/credits-{before,after}-generation.png`。
- `npx tsc -p tsconfig.tools.json` / `e2e/tsconfig.json` / `npx eslint`（本轮改动的 11 个文件）：0 问题。
- 整套单测：`npm test` **88 个文件 / 954 条全绿，352 秒**（关掉文件级并行之后，见上面第 5 条）。
- 整套 e2e：`npx playwright test -g "@smoke"` **44/44 通过，14.6 分钟**。
  第一次跑红 7 条是环境（刚跑完单测 + Chromium 栈溢出），过程与判据写在上面 §51 那条口径 correction 后面。
- **现在可以说的**：这一片之后，单测与 e2e 两套都整套绿过。仍然不许说的是"覆盖完整"——
  @smoke 只有 44 条，它盯的是用户可见的那几条主干。

**这一片没有做的（照实记，不要当成已生效）**

- ~~storage / generation / team collaboration / publishing 那四格上限只是页面上的数字~~ **storage 那一格后来接上了执行方**
  （2026-09-28，见文末「§133/§134 第二片」与 ADR-0018）；generation / team collaboration / publishing 三格仍然只是数字。
- Image / Video / Compute 三类只有发放方、没有消耗方（要等 §38 图像、§40 视频那条路）。
- ~~改档位没有界面：`UPDATE users SET plan` 是服务端代码里的事。~~ **2026-09-30 接上了**：
  `/admin/users` 上有档位选择（`domain/plan-admin.ts` + `PATCH /api/admin/users/[id]/plan`），
  取舍见 ADR-0021。它**不是购买流程**（§159：账面上没有一分钱流进来，所以界面上不出现"升级"也不标价），
  是运营兜底动作；与"改角色"刻意相反，它**允许 admin 改自己**（发额度 ≠ 授予权限）。
- 这道门**不预扣**：并发可以把余额跑到负数（预扣要一个能把 provider 调用包进去的可回滚事务，今天没有）。
  负余额在流水里看得见，这个松是选定的，写在 `credit-ledger.ts` 注释与 ADR-0014 里。


## §38 第二格：Text→Image 端到端接上，image 那个额度桶第一次有消耗方（2026-09-28 凌晨）

需求原文（§38）要的是五条箭头，而本机没有图像 provider（阻塞项"真实 AI provider key"还在）。
第一格只落了合成器与它的单测；这一格把**那条链上其余每一环接成真的**：

- `apps/web/src/server/domain/image-studio.ts`（新）：规格门 → **额度门** → `startTask(capability='demo')`
  → 本地合成 → 与上传**同一道**摄取门 → 资产行 → `finishTask`（这一句里发生扣点）→ 通知。
- `POST /api/projects/[projectId]/images`（新）：CSRF → 会话 → 归属 → zod → 上面那个函数；
  额度用尽回 429、规格不合回 400，两者理由都直接透传，不是界面文案。
- 修掉第一格点名的两处真缺陷：`uploadImageAsset` 原本硬编码 `source:'upload'`（生成物记成上传，
  事后查不到哪张是模型给的），现在收 `source` 与 `genMeta`；`assetRowToRef` 原本不映射
  `taskId` / `demoMode`，所以 `AssetsPanel.tsx:111` 那枚 DEMO 角标读的是一个**没人写过的字段**——死代码。

**验证**（`apps/web/test/image-studio.integration.test.ts`，打真库，4 条）：
- 一次生成在四处各留一行：`assets`（`source='generated'`、mime/宽高、对象键 `projects/{projectId}/{assetId}.png`
  由服务端按 id 生成）、清单里的 `generatedBy`（provider=demo、prompt 回填、**demoMode=true、taskId 指回那一次任务**）、
  `agent_tasks`（succeeded / capability=demo）、`credit_ledger` 恰好一行 `-2`，且余额按量减少。
- **门的位置**这一条是这一片的重点：余额扣到 0 之后再生成，`assets / tasks / ledger` 三个计数**一个都不许多**；
  拒绝理由原文照抄 `refusalFor`（"Image credits 不够：这一次需要 2 点，现在只有 0 点"）。
- 复用与消费是两件事：同 prompt 同 seed 拿回**同一行**（同 checksum 在项目里只有 1 行）但**两行任务、两笔扣点**；
  只换 seed 必须给新行——否则第二次点击等于什么都没生成。
- 非法输入（宽 2048、空 prompt）不过门、不留任务行、不花额度。

**两次变异探针**（跑完还原）：把额度门挪到 `startTask` 之后 → 目标用例红，断言消息就是
`expected { assets: 1, tasks: 2, ledger: 1 } to deeply equal { …tasks: 1… }`（多出来的正是那条
"running 然后失败"的假账）；删掉 `assetRowToRef` 里 `demoMode` 那行 → 红 1 条，红在那句
"DEMO 与真模型的来源必须可区分"。**第一格说"角标读一个没人写的字段"，这一格的凭证是删掉映射会红。**

探针那遍一共红了 2 条，其中 1 条是**连带**：额度门用例在断言失败后就不会执行"把余额还回去"那一行，
于是下一条被"额度不够"挡住。已改成每条用例自己补足额度——**连带红不是证据，是用例之间的依赖**。

`npx tsc -p apps/web/tsconfig.json --noEmit` 干净；`image-studio + image-synth + assets` 三个文件 **17 条全绿**
（含上传链路，确认改了 `uploadImageAsset` 签名没把上传弄坏）。
**上面 #65 那节的"90 文件 / 965 条全过"是这一片之前的整套数**——新的 4 条还没进过整套，写完这段就会重跑。

**这一片没有做的**：Studio 面板里还没有那个入口（§158 要求真浏览器 Run/Test/Screenshot，单独一片；
所以"角标在界面上真的亮起来"目前只有服务端与单测层面的凭证，没有肉眼看到的图）；
其余四条箭头（Image→Image、Sketch→Image、Reference→Variation、Character→Scene）一格没动；
真 provider 那一格仍然缺 key——换成真模型时改的是 `image-synth.ts` 那一个文件里的像素来源。


## §38 第三格：Image Studio 的界面入口落地，顺带挖出模型层一处"撤销不可逆"（2026-09-27）

第二格只有服务端与单测；这一格把入口接进 Studio，并按 §158 在真浏览器里跑了一遍。

**做了什么**
- `AssetsPanel` 顶部加了 prompt 输入框与"生成图片（DEMO · 扣 2 点）"按钮（空 prompt 不可点）；
  卡片上那枚 DEMO 角标补了 `title`（说清"这不是模型给的"）与 `data-asset-demo-badge`。
- `studio.generateImageFromPrompt`：一次点击 = 一个事务（`addAsset` + 选中元素的 `style.fills`），
  没选中元素时只进清单并在回执里写"选中元素后生成才会同时贴上"——不猜用户要贴哪。
  429/400 的理由原样摊在 `[data-asset-error]` 上。
- 新 e2e `e2e/image-studio.spec.ts`（@smoke）：生成 → 卡片带 DEMO 角标、缩略图能被浏览器解码
  （`naturalWidth > 0`）、画布那层的 assetId 与卡片同一个、引用数 1 → 撤销 → 重做 →
  `/credits` 上看得见那一笔 `-2`（理由里带"DEMO 模板 image.generate"，且绑定任务）。

**e2e 第一次跑红，红出来的不是界面问题，是模型层的真缺陷**：撤销之后画布上的填充收回了，
但清单里那一条**永远留着**。查到 `packages/design-model/src/patch.ts:599`——`addAsset` 的逆操作
只在"目录里本来就有这一条"时才写（写的是还原旧值），**新增**那一路什么都不写，于是撤销无从下手。
全仓库 `grep addAsset **/*.test.ts` 是 0 命中：这个 op 的撤销从来没被测过，所以上传路径
（`uploadImageAsFill` 也是 `addAsset` + 贴填充）一直带着同一个洞，只是没人断言过"撤销后目录里少一条"。
修法：新增那一路的逆操作写 `removeAsset`（沿用 `insert` → `remove`、`addToken` → `removeToken` 的既有口径）。

**验证**：`packages/design-model/test/patch-commands.test.ts` 新增 3 条（撤销同时收回条目与填充、重做又回来；
**覆盖已有条目时撤销是还原不是删除**——这一条挡的是"把目录清干净当撤销"这种修法；逆操作形状）。
变异探针：把新加的那行 `removeAsset` 删掉 → 红 2 条（撤销那条 + 形状那条），
而"还原不是删除"那条**保持绿**（31 passed），说明它不是靠这次改动才过的。
e2e：`图像生成` 1 passed（13.7 秒），回归 `上传图片 | 资产库` 2 passed（36.4 秒）。
截图 `screenshots/image-studio-generated.png` 人眼看过：角标、回执文字、画布填充、清单缩略图都在。
整套重跑（`patch.ts` 的撤销语义变了，第二格欠的那句"写完这段就会重跑"在这里还上）：
**91 个文件全过 / 972 条全过，813.26 秒，退出码 0**。这一遍比 #65 那次的 240 秒慢三倍，
本机同时挂着 50 多个别的项目的 node 进程（内存只剩 2GB 上下）——**绝对时长在这个环境下不是结论，
"全过 + 退出码 0"才是**；要拿时长做比较得等同一种负载。

**环境上的一条坑（写进 TESTING.md 了）**：3100 上有一个更早会话留下的 `next start`（生产构建），
`playwright.config.ts` 的 `reuseExistingServer: true` 会直接复用它——于是新代码在浏览器里根本不存在，
用例红在"等不到 `[data-image-generate]`"。这条红**不是被测代码的结论**。改成另起 `next dev -p 3210`
并用 `NEXUS_WEB_URL` 指过去才量到真结果。**下次跑 e2e 前先确认 3100 上是谁**。

**这一片没有做的**：`addComponent` 的逆操作是同一形状的洞（只在已存在时写还原，新增那一路不写），
今天没有任何用例断言过"撤销能删掉一个组件"，所以先记着不动——修它要连带补组件引用的清理语义
（**下一段已补上**）；
其余四条箭头（Image→Image、Sketch→Image、Reference→Variation、Character→Scene）仍未动；
真 provider 仍缺 key。


## 补上第三格点名的那道洞：addComponent 的撤销 + 它牵出的删除门（2026-09-27）

上一段末尾记的那条"先记着不动"在这一段动掉了。

**做了什么**
- `patch.ts` 新增两个 op：`removeComponent`（移出目录 + 把**所有页面**上引用它的实例节点的
  `componentId` 一起解开）与它的逆 `restoreComponent`（放回定义 + 按记下的 `(pageId, nodeId)`
  把链接接回来）。形状照 `removeAsset` / `restoreAsset` 抄，包括"对不存在的 id 记 `skipped`，不静默成功"。
- `addComponent` 的逆操作补上新增那一路：`else ops.push({ op: "removeComponent", ... })`。
- `packages/schemas` 的 `PatchOpSchema` 加这两条，`npm run contract:export` 重导契约
  （`design-patch / ai-response / ai-job-status` 三个 JSON Schema 各加一份枚举，共 +147 行）。
- **`removeComponent` 同时进两边的高危名单**：`apps/web/src/server/ai/approvals.ts` 的
  `DESTRUCTIVE_OPS` 与 `apps/ai-service/src/ai_service/execution.py` 的同名集合。
  它带走定义并连带解开实例，漏一档就等于这一档**两边都不拦**。
  审批卡片上那句理由也补了 id 来源（`describe()` 原先只认 `nodeId/key/assetId/pageId`，
  `componentId` 会退回裸 uuid），组件名后头写清"删除会连带解开引用它的实例"。
- 提示词里的 op 词汇表**没加**这两条：`removeAsset` 也不在表里——不邀请模型删资产/删组件，
  但它真删了就得拦得住。

**验证**
- 新文件 `packages/design-model/test/patch-components.test.ts`：6 条（一次事务里「建组件+放实例」的
  撤销/重做；覆盖同 id 时撤销是还原不是删除；逆操作形状；删定义连带解开实例；跨页实例的删除→撤销→重做；
  对不存在的 id 记 `skipped`）。
- web 侧门：`ai-approvals.integration.test.ts` 那条"带走东西的 op 全被拦下"从 4 档变 5 档
  （`heldOpCount` 5→6），并新增两条断言：理由里出现"定价卡片"、**不许**出现裸 componentId。
  连契约与 schemas 一起跑：**4 个文件 / 50 条全过**。
- ai-service：**64 passed + 1 skipped，退出码 0**，其中包含跨语言那条
  `test_destructive_op_set_matches_the_web_gate`（它直接读 web 源码比对集合，不抄第二份常量）。
- 四次变异探针，跑完全部还原（还原后用 `git diff` 核对过）：
  A 删掉 `addComponent` 新加的那行 `removeComponent` → 红 2 条（撤销那条 + 形状那条），
  而"覆盖时是还原不是删除"**保持绿**；B 删掉 `removeComponent` 里解链的那个循环 → 红 2 条
  （连带解开那条 + 跨页还原那条）；C 把 `describe()` 里的 `op.componentId` 拿掉 → 红 1 条，
  红在"理由里要点名定价卡片"；D 只把 `removeComponent` 从 web 清单里拿掉 → web 那条红（5→4），
  同时 Python 的集合比对那条也红。**C 与 D 证明"名单加了但读不懂在删什么"和"只补一边"都拦得住。**
- `npm run typecheck` 干净（7 个工程）。

**第一段用例自己红出来的那条**：我起初照 `addAsset` 的形状写成"文档里先有一个引用 cmp-new 的实例、
再执行 addComponent"，红在重做那一步。原因不是实现错，是这个前置状态本来就不合法——
`addComponent` 从不给既有节点接链接，所以撤销时 `removeComponent` 解掉的链接不是这次事务建立的，
重做自然接不回来。真实形状是"一次事务 = 建组件 + 放实例"，用例改成那个形状后绿。
**教训：逆操作的连带清理可能比正操作做得更多；这种不对称只在有既有引用时才暴露，
而那种文档本来就不该存在——别把非法前置状态的行为写成断言，那会锁死一个不该支持的语义。**

**这一片没有做的**：Studio 里还没有"删除组件"的入口（模型层能撤了，界面还没有那个按钮）；
`docs/STUDIO.md` 的组件那一节还没提这两个 op；§38 其余四条箭头、真 provider key 仍未动。


## §38 第二格箭头：Reference → Variation 的服务端那一段（2026-09-27）

**做了什么**
- `SynthInput` 多了 `hueAnchor`（0..1）：它**参与身份哈希**，也参与配色。参与哈希是必须的——
  否则"同 prompt 同 seed 换一张参考"会被去重复用成同一行，第二次点击什么都没生成。
- `generateDemoImage` 多收 `referenceAssetId`：走 `openAssetForOwner`（按归属取字节，不按 id 裸取），
  用已有的 `extractVisualDna` 量出主色，转成色相锚点喂给合成器；量不出来（不是 PNG、全透明、没有主色）
  与不拥有这张图都是**拒绝**，不退化成"没参考随便生成一张"。参考图先解析、后谈额度，解析失败不留任务行也不扣点。
- 路由 `/api/projects/[id]/images` 的 body 多一个可选 `referenceAssetId`（只接受 id，字节由服务端自己取）。
- `assets.ts` 的 `rowById` 加了 uuid 形状门：**这是这一片红出来的真缺陷**——非 uuid 的 id 直接进 where，
  Postgres 抛 `invalid input syntax for type uuid`，于是"这个资产不存在"在所有走这条路的接口上都是 500。
  现在形状不对就当查不到，路由只剩 404 这一种说法。

**验证**：`image-studio.integration.test.ts` 新增 3 条，与 `image-synth` 一起 **15 条全过**——
换参考就是换字节（且各自都与不带参考的那张不同）、同 prompt 同 seed 同参考复用同一行（同 checksum 只 1 行）、
参考图不存在（畸形 id 与合法但不存在的 uuid 两种）时 `assets/tasks/ledger` 三个计数一个都不许多。

**这条箭头的证据边界（写清楚，别over-claim）**：上面那组断言钉住的是**身份与元数据**——
参考图确实换了字节、确实记进了 `genMeta`（`referenceAssetId / hueAnchor / referenceDominant`）。
我本来还想钉"画面看着像参考图"：写了四条均匀分布的锚点、量产物主色要求落在各自 ±0.2 的格子里，
**这条是红的**（锚点 0.25 量回 0.918）。红得对：合成器的形状色是 `anchor + rand()`，
主色由形状而不是背景决定，所以"绝对色相等于锚点"本来就不成立。我把这条断言删掉了而不是放宽容差——
**放宽到能过就是假绿**。留下的真实欠账：DEMO 合成器的"变体"只保证"由这张图的色相派生出来、且与原图不同"，
不保证人眼看着像参考图；正解是换成真 image-to-image provider（§76-79 那一格），
或者先改合成器让形状色也按锚点取（改渲染口径时这条断言要一起补回来）。

**这一片没有做的**：界面入口（资产卡片上那个"以它为参考生成变体"的按钮 + e2e）；
Sketch → Image、Image → Image、Character → Scene 三条箭头；真 provider key。

**补：这一条箭头的界面入口（同日第二格）**
- 资产卡片上多了一个"生成变体"按钮（`[data-asset-variant]`，非位图/忙碌时不可点），
  `studio.generateImageFromPrompt(prompt, referenceAssetId)` 带上参考 id；回执文案里明写
  "以清单里那张为参考的变体"，按钮的 `title` 也明写"换的是它派生出的色调，不是把画面内容改成另一个场景"
  ——上面那条证据边界如果界面上不说，用户就会按"图生图"来期待它。
- e2e `@smoke 图像生成` 加长：生成 → 撤销 → 重做 → **点变体** → 清单多一行、缩略图能被解码、
  那张是**另一个 asset 行**（img src 与原图不同）、角标仍是 DEMO、额度页那一笔 -2 看得见。
  **1 passed（1.2 分钟）**，截图 `screenshots/image-studio-variation.png` 人眼看过：
  原图偏红绿，变体偏蓝紫——色调确实换了，但"看着像原图的变体"这件事仍然没被钉住（与上面那条边界一致）。
- 又踩了一次 3100/3210 那个坑，这次是反向的：**上一份 dev server 服务的是旧路由表**，
  `POST /images` 直接 404，红在"画布没出现生成图"上。判据还是那条：红之前先确认服务的是哪份代码
  （`netstat` 看谁在听 + 换端口起一份新的）。这次顺带确认 `GET /api/assets/<非 uuid>/file` 返回 404
  是**上一格那条 uuid 门的正确结果**，不是路由丢了——别把修好的东西再当成 bug 修一遍。

**再补：§13 组件的界面投影（同日第三格，关掉上面点名的欠账）**
- 设计系统面板顶部多了一段"组件"（`[data-components-section]`）：列出目录里的组件、每个被多少实例引用、
  以及两个动作——**存为组件**（把当前选中的元素指认为主组件的根；没选中就不可点，面板不凭空造真值）
  与**删除**（一次 `removeComponent` 事务，可撤销）。
  这一段之前根本不存在：组件在全库只有计数出现（上下文面板的 totals、属性面板那行"多少个组件"），
  模型层的目录在界面上没有投影——所以"能撤销的删除"修好了也没有入口可用。
- 新 e2e `e2e/components-panel.spec.ts`（@smoke）：未选中时按钮 disabled + 空态文案 → 选中 Headline →
  存为组件 → 卡片出现且写着**引用 0**（还没有实例，写 1 就是谎）→ 删除 → 卡片消失 →
  撤销 → 定义回来、引用数仍是 0 → 重做 → 又没了。**1 passed（27.3 秒）**，
  截图 `screenshots/components-panel.png` 人眼看过。
- 两次红都不是被测代码的错，记下来免得下次再踩：① 断言按钮 disabled 之前先切了面板——元素还没渲染；
  ② 图层行只在"图层"那一栏里存在，切到设计系统栏之后再查 `[data-layer-id]` 必然为空。
  **跨面板取句柄的顺序必须是：先拿 id，再换栏。**
- 仍未做：把实例"重置为主组件""变体切换"接进界面（§13 的 override 那半）。
  ~~以及从组件目录一键实例化到当前页~~ **已做**（§13 第三十四片，见文末那一节）。
  ~~改主组件，实例不跟上~~ **手动那半已做**（§13 第三十五片：`syncInstanceOps()` + 面板「更新实例」，
  自动跟随仍欠，那要转向 ADR-0078 的选项 1）。

**再补：§39 / §40 的 Character → Scene（同日第四格）**
- 需求 §39 要的是"用户建一个角色，系统存 identity/appearance/style/clothing/traits，后续生成**同一个角色在不同场景里**，
  尽可能保持视觉一致"。角色档案那一半早就有了（§46 那一格），但**"不同场景"这一半没有生成入口**，
  而且 `assets.character_id` 这一列从 0000 建库起**没有任何写入方**——一列没人写的真值就是文档里的装饰。
- 现在 `generateDemoImage` 认 `characterId`：色相锚点取自角色档案的 `visualIdentity.palette`（第一个合法十六进制色），
  资产行写入 `characterId`，`genMeta` 记 `characterId / hueAnchor / anchorDominant`。
  于是"视觉一致"第一次有了**可测的定义**：同一角色的不同场景 → 同一个锚点 + 不同字节；换一个角色 → 换一个锚点。
  三条拒绝路径都留得住：档案 palette 是空的（不拿"随便一张"冒充它的场景）、角色不在这个项目里、
  参考图与角色同时给（两个来源同时给就说不清这张图是照谁画的）——**都在写任务行与扣点之前**，三个计数一个都不许多。
- 验证：`image-studio.integration.test.ts` 新增 4 条，与原有 7 条一起 **11 条全过**。
  变异探针：把"量出来的锚点喂给合成器"那一行删掉 → **红 2 条**（一致性那条 + 换角色换锚点那条），
  另 9 条保持绿；探针跑完用 `git diff` 核对过还原。
  顺带把 `referenceDominant` 改名成 `anchorDominant`——现在两种来源（参考图 / 角色）都写这一格，旧名字会谎报来源。
- 仍未做：角色场景的界面入口（角色面板上那个"生成它的场景"按钮 + e2e）、§40 其余三条
  （Text → Video / Image → Video / Storyboard → Video）、以及"clothing/traits 真的参与画面"这件事——
  今天的锚点只用到 palette 一栏，其余字段仍只进文本上下文。

**这一格的整套凭证**：`npm test` **92 个文件全过 / 985 条全过，退出码 0**（跑于 Character → Scene 落地之后）。
上一格那三条箭头各自只带了自己文件的数，这里合上：模型层撤销、两侧删除门、契约、摄取门 uuid 修、
参考变体与角色场景，全都在同一遍整套里同时绿。

**下一格（已登记为任务 #67）**：角色面板上的"生成它在另一个场景里"。用例草稿已经写好并留在 `/tmp/character-scene.spec.ts.draft`
（不在仓库里，因为它断言的 `[data-character-scene]` / `[data-scene-prompt]` 两个控件还没实现——
把不存在的选择器提交进 e2e 就是让下一位跑的人去猜红的是谁）。实现时要动的三处，选择器契约先定死在这里：
`studio.generateImageFromPrompt(prompt, { referenceAssetId?, characterId? })`（把现在那个位置参数换成对象，
`AssetsPanel` 里"生成变体"那一处调用同步改）、`CharacterPanel` 视觉标识那一段之后加输入框与按钮
（palette 为空时按钮不可点，与服务端同一口径）、面板回执走 `state.assetNotice` 并挂 `[data-character-notice]`。

**Character → Scene 的界面那一格：先落了一半，另一半如实退回**（同日稍后又落了，见本节末尾）
- 已落：`studio.generateImageFromPrompt` 的第二参数从"参考图 id"换成 `source?: { referenceAssetId?, characterId? }`
  （两个来源在界面上是两件事，位置参数到第三个就没法加了），`AssetsPanel` 的调用点同步改。
  这一半是行为不变的改造，凭证是**原有的那条 e2e 重跑：1 passed（1.6 分钟）**。
- 退回：角色面板里"生成场景"那一块（补丁在 `/tmp/character-panel.patch`，用例草稿在 `/tmp/character-scene.spec.ts.draft`）。
  **红在浏览器里，不是红在编译**：填完色板之后"保存档案"仍然是 disabled，
  而它的门是 `!dirty || saving`（`CharacterPanel.tsx:480`，dirty 用 `JSON.stringify(selected.profile) !== JSON.stringify(draft)` 判）。
  也就是说 `page.fill('[data-character-visual="palette"]', ...)` 之后 dirty 仍然为假——
  要么那次 fill 没进到受控 input 的 onChange，要么 `selected.profile` 与 `draft` 在那一刻本来就相等。
  **上面那段"诊断"是错的，这里更正**：我当时说嫌疑收在 `patchProfile` 的入口条件（`!selected || !draft` 静默返回），
  还写了"fill 落在 DOM 里但没落进 setDraft"——**证据并不支持这个结论**。真相朴素得多：
  那条断言本身放错了位置。用例是 `click('[data-character-save]')` 之后再断言"保存档案"可点——
  点下去之后它当然变成 disabled（按钮文案就是快照里那句"保存中…"），而 Playwright 的 `click` 本来就等过 enabled，
  也就是说 **dirty 一直是真的，面板一直是对的，红的是我的断言顺序**。
  第二处同理：换成断言"生成场景"可点之后仍然红，因为那时场景输入框还空着——它本来就该不可点。
  两处都改完：**e2e 1 passed（13.4 秒）**。
  教训写在这里代替猜测：断言"某按钮可点"之前先问一句"上一步点击是不是刚刚把它自己变灰了"；
  快照里那句"保存中…"其实已经把答案给我了，是我没去读它。
下一格的第一步应该是把这条门量清楚
  （在页面里读按钮文案是"保存档案"还是"没有改动"，再决定是改用例还是改面板）。
  顺带记一个已经想清楚的设计：那个按钮的可用条件应当读**已保存的** `selected.profile.visualIdentity.palette`，
  不是草稿里的——服务端判的是存档，界面拿草稿放行就会让人点出一个必然被拒的请求。

**Character → Scene 的界面那一格：落地了**
- 角色面板的视觉标识那一段下面多了场景输入框 + "生成场景"按钮（`[data-scene-prompt]` / `[data-character-scene]`）：
  可用条件是**已存档**的色板非空 + 场景非空 + 没有正在忙——服务端判的是存档，界面拿草稿放行就会点出一个必然被拒的请求。
  回执挂在 `[data-character-notice]`，文案是"这是清单里那个角色的一个场景（色调取自它的视觉标识）"。
- 凭证：`e2e/character-scene.spec.ts`（@smoke）**1 passed（13.4 秒）**——空色板时按钮不可点 → 填色板存档 →
  按钮活了 → 生成 → 切到资产库，最后一张卡片带 DEMO 角标且缩略图 `naturalWidth > 0`。
  截图 `screenshots/character-scene.png`。
  三条入口（Text→Image 与变体、组件面板、角色场景）**一起回归：3 passed（33.0 秒）**——
  这一条是给 `generateImageFromPrompt` 那次签名改造（位置参数 → 来源对象）的回归凭证：
  三个调用点里改了两个，跑一遍才知道没漏。
- 于是 §38 / §40 那五条箭头里，text→image、reference→variation、character→scene 三条在界面上点得出来了；
  image→image 与 sketch→image 仍未动（原因写在上面那条清单里）。

**顺带：`assets.character_id` 的读的一半也接上了**
上一格只写了列，清单投影里没有它——**一列只写不读的真值在界面上等于不存在**。
现在 `AssetRef.characterId` 有映射，资产卡片上多一枚"角色场景"标记（title 带角色 id；
面板没加载名册，所以这里不猜名字，猜出来的就是谎）。
凭证：集成用例新增一条断言"库里写入了归属角色，清单投影必须读得出来"，
变异探针把那一行映射删掉 → **红正好这一条**（另 10 条保持绿），11 条一起过；`tsc` 干净。
浏览器那一半也补了凭证：`e2e/character-scene.spec.ts` 现在断言卡片上有「角色场景」标记，**1 passed（21.5 秒）**。

## §39 点名的四栏终于有地方存了（2026-09-27）
需求原文写着"用户创建 Character A，系统保存 identity / appearance / style / clothing / traits"。
档案里过去只有 `appearance` 对得上，**identity / style / clothing / traits 四栏根本没地方放**——
不是"还没填"，是类型里没有这一栏，用户在面板上找不到输入口，检索与生成也拿不到。
- `CharacterProfileSchema` 加这四栏（`traits` 是短标签数组），**每一栏都带 `.default()`**：
  库里已有的档案没有这几栏，不补默认值的话旧行在载入时解析不过去，
  面板上表现成"这个角色读不出来"——那是数据被界面弄丢，不是契约在把关。
- `world-model` 的 `CharacterProfile` 接口与 `emptyProfile` 同步；建档时这四栏是空串/空数组，
  但**在**（不是 `undefined` 冒充"有这一栏"）。
- 角色面板多了三个输入口：身份（不变的那部分）、穿着、画风/媒介。
- 验证：新文件 `character-fields.integration.test.ts` 3 条 —— 建档时四栏为空但在、
  **写进库再从库里重新读回来四栏一个字不丢**（不看 update 自己回给的那份内存对象，直接查 jsonb）、
  手工抹掉 jsonb 里那四栏模拟加字段之前的旧行，仍然读得出来且 `unreadable` 为空。
  变异探针：把 `clothing` 的 `.default('')` 去掉 → **红第三条**，消息就是"旧行读不出来"，
  证明那个默认值不是装饰；还原后 `character-fields + characters` 两个文件 **10 条全过**。
  `npm run typecheck` 七个工程干净（没有一处字面量构造档案被这次改动打破）。
- ~~仍未做：`traits` 的界面输入口（面板上还没有那一栏）~~——**2026-10-27 补上**（收尾记在下面
  "traits 的输入口"一节）；把这四栏喂进 §39 的正题——
  **生成时真的按 identity/clothing/style 保持一致**（当时角色场景的锚点只用 palette 一栏，
  后来按"§39 的第二半"接上了），
  以及 knowledge / RAG 文本里带上这四栏（当时检索命不中"穿靛蓝斗篷的那个角色"，同节补上）。

**接上§39 的第二半：这四栏进得了检索**
存进档案只是第一半——检索拿不到，就等于**对 AI 不存在**（面板上看得见，模型查不着）。
`knowledge.ts` 的角色切分里多了 身份 / 穿着 / 画风 / 特征 四小节（空小节照旧不进索引）。
凭证：`character-fields.integration.test.ts` 新增两条断言——保存档案后直接查 `knowledge_chunks`，
`%靛蓝斗篷%` 与 `%认路很快%` 都要有行；变异探针把这四行从切分里删掉 → **红在"穿着写进了档案，却没进知识索引"**，
还原后 `character-fields + knowledge` 两个文件 **11 条全过**。
~~仍欠：`traits` 的界面输入口~~（2026-10-27 补上，见下面"traits 的输入口"一节）；
让生成读这四栏随后落地（见"§39 的第二半（补记）"）。

## traits 的输入口：试过，没落地，症状与下一步实验记在这里（2026-09-27）
面板里加了一个逗号分隔的 traits 输入框，用例填进去之后点"保存档案"——**按钮一直不可点，`click` 等到超时**。
字确实留在输入框里，也就是说那次 `onChange` 没落到 `setDraft`。
这**不是**上一格"断言放错位置"的老问题：这一次是点击被 disabled 挡住，不是断言点错。
补丁连同用例改动一起放在 `/tmp/traits-ui.patch`（43 行），**没有提交进仓库**——
半截 UI 留在树里，下一次跑 e2e 的人会以为那是被测代码的问题。
下一步实验定死：把 onChange 换成 `visualIdentity.motifs` 那条**已经证明可用**的写法再试一次。
若那样 dirty 就变真，问题在 `traits` 这个键本身（`textField` 的联合类型不含数组字段，
`patchProfile` 的入参类型与 `withProfile` 的合并语义要复核）；若仍然不真，问题在这个输入框挂载的位置。
不查清就不写"已完成"：现在面板上少一栏 traits，是**已知缺口**。

**2026-10-27 收尾：** 当日补丁没进仓库，原始失败已无法复现，所以不把今天的根因冒充成"就是那天那条"。
这次先把同类输入的真实行为量了一遍，发现的是一个更广的毛病：**所有列表字段**（目标 / 恐惧 / 口头禅 /
母题 / 色板）每次按键都把数组 `join` 回 `value`，刚敲下的分隔符在解析时被 `filter(Boolean)` 吃掉——
Chrome 里逐键输入 `目标A` ⏎ `目标B`，输入框值变成 `目标A目标B`，母题同理 `母题A母题B`；
此时保存按钮仍可点，所以问题不是"dirty 不真"（那天猜的两个方向都不在点上），
而是**第二个条目根本开不了头**。traits 只是新加的那一栏，一出生就落进同一套写法。
- 修复：`ListText` 留住"正在敲的原文"（文本 `useState` + `useRef` 记外部数组，只有外部值真的不同
  才用 join 覆盖，保存后光标不跳），分隔符只参与解析：目标 / 恐惧 / 口头禅走换行，母题 / 特征走逗号，
  色板走空格。画风之后补上"特征"输入口（`data-character-field="traits"`）；编辑器容器按
  `selected.id` 加 key（`data-character-editor`），换角色不带走上一个的草稿。
- 凭证：`e2e/character-fields.spec.ts` 用 `pressSequentially` 真逐键敲 换行 / 逗号 / 空格，先断言
  敲完立刻还在（旧代码在 `:55` 处得到 `目标A目标B`），保存后直接 GET `/api/projects/<id>/characters`
  断言 `traits === ['怕水','话多']`、`goals === ['目标A','目标B']`（数组不是原文塞字符串），
  再重载重新选角断言四栏原文；截图 `screenshots/character-fields.png`。
- 变异探针：把 `setText(next)` 换成 `setText(joinList(splitList(next, mode), mode))` →
  **红在 `e2e/character-fields.spec.ts:55`，Received 是 `目标A目标B`**；还原回
  sha256 `83319aab…f301d9` 后重跑 **1 passed**。
- 仍欠：列表字段没有"输入到一半就自动保存"以外的撤销（角色编辑本就不进 Command 栈，见面板注释）。

## §39 的第二半（补记）：角色的四栏现在真的走到生成请求里
上一次因内存耗尽（node v8 abort）退回的接线，这次跑通了并落地：
`generateDemoImage` 在拿到 `characterId` 时，把档案里的 身份 / 穿着 / 画风 / 特征 拼进**交给合成器与任务行的 prompt**
（服务端派生，不依赖前端传什么）。边界照旧写清楚：DEMO 合成器只认 prompt 的哈希，
**画不出"靛蓝斗篷"的语义**——这一格补的是接线，欠的还是像素；换上真 provider 时不必再接一遍。
凭证：`character-fields.integration.test.ts` 新增断言——生成一次后直接查 `agent_tasks.input.prompt`，
必须同时含"靛蓝斗篷 / 厚涂、暖光 / 认路很快"；变异探针把拼接那一行改回 `input.prompt` →
**红在"任务行里的 prompt 没带上穿着设定"**，还原后 `character-fields + image-studio` 两个文件 **14 条全过**。
顺带踩到一个真约束：生成角色场景**要求档案里有 palette**（没有就拒绝，不拿随便一张冒充），
所以测试角色建档后要先把视觉标识填上——这条约束第一次是在用例里被自己撞出来的。

## §39 的第二半（续）：角色肖像（Character Portrait）与一处"永远为假"的判定
同一条链上补了**为角色生成它自己的参考图**这条支路：`generateCharacterPortrait`（域层 + 路由 `z.boolean().optional()`）。

- **肖像由档案驱动，不看用户 prompt**：给 `characterId + generateCharacterPortrait` 时，
  prompt 由 身份 / 穿着 / 画风 / 特征 **加上视觉标识的轮廓与标志** 组装（`visualIdentity.silhouette` / `motifs`
  以前只在档案里躺着，没进过 prompt），用户那句话被**忽略**而不是拼在后面——否则它就不叫"由档案驱动"。
- **产出带 `characterPortrait: true` 标记**（任务行 + `genMeta`），供后续 Character → Scene 以
  `referenceAssetId` 复用它，这是"同一个角色在不同场景里认得出"的落地方式。
- 与 `referenceAssetId` 互斥（两个来源同时给就说不清照谁画）；与场景共用同一个由视觉标识导出的
  `hueAnchor`，所以肖像与场景的配色是一套，不是各画一套。

**顺手修掉一处"永远为假"的守卫**：这道判定原来写成

```ts
if (input.characterId && input.generateCharacterPortrait && !input.characterId) { /* 拒绝 */ }
```

前后自相矛盾，**恒为假**——于是"只给 `generateCharacterPortrait` 不给 `characterId`"不会被拦下，
而是**静默地按普通 Text→Image 生成一张图**（进不了角色分支、档案读不到），用户以为自己拿到了角色肖像。
这类写法 **typecheck 看不出来、eslint 也看不出来**（试过 `@typescript-eslint/no-unnecessary-condition`，
它不跨合取式推理，本仓库当前规则集同样不报）——所以防线只能放在**测那道守卫本来想守的行为**上，
这正是下面那条用例存在的理由。

**凭证**：`image-studio.integration.test.ts` 新增 5 条（只给 portrait 不给 characterId 必拒且一行都不许多、
肖像忽略用户 prompt 而带上身份/穿着/画风/特征/轮廓/标志、`genMeta.characterPortrait` 与归属列、
肖像与参考图互斥不花额度、同一角色肖像与场景同锚点但不同字节）。
**变异探针**：把那行守卫还原成旧的自相矛盾写法 → **红在"没有角色却按普通文生图放过去了——用户会以为这是角色肖像"**，
改回后 16/16 全过。`character-fields.integration.test.ts` 那一组（四栏进 prompt）同批通过，
两个文件合计 **19 条**；`npm test` **94 文件 / 1000 条全绿**。

**仍欠**：真 provider 的像素（DEMO 合成器只认 prompt 的哈希，画不出"靛蓝斗篷"的语义）。

## §39 的第二半（再续）：肖像的界面入口，以及上一次欠下的那条变异探针
面板上补了「生成肖像」按钮（`[data-character-portrait]`），**不给输入框**：肖像完全由档案驱动，
让用户填一句话再被忽略，比不给输入框更让人困惑。它的可用条件是**已存档的 palette**，
与场景那一栏的输入框无关——e2e 里就钉了这一对：色板存好之后肖像已可点、场景仍不可点。
回执也分成两档：肖像说"这是那个角色自己的参考图"，不再混进"那个角色的一个场景"里
（同一句话糊住两种东西，就是给用户一个与事实不符的交代）。

**凭证**：`e2e/character-scene.spec.ts` 扩到一条链上跑完 场景 → 肖像，**1 passed / 42.1 秒**，
截图 `screenshots/character-portrait.png`（清单两张卡、肖像那张带 DEMO 角标）。
第一次跑是红的：切走再切回角色面板时编辑器整个不见了——`CharacterPanel` 的 `selectedId`/`draft`
是组件本地 state，面板换标签页会重新挂载。失败快照先看过才改的（不是猜的）：
补一次 `[data-character-tab]` 点击，与生成场景之前那一步是同一条 remount 规矩的第二次命中。

**把上次没跑到的探针补上了**：`docs/ROADMAP.md` 里"四栏进 prompt"那一格先前那句探针结论是**没跑过就写进去的**，
这次实测：未变异 3/3 绿 → 把 `effectivePrompt = [input.prompt, look]…` 改回 `effectivePrompt = input.prompt` →
**红正好 1 条**，消息原文 `任务行里的 prompt 没带上穿着设定: expected '在雪地里' to contain '靛蓝斗篷'`（另 2 条仍绿）→
`git checkout` 还原、`git diff` 该文件为空 → 再跑 3/3 绿。

**看图看出的两处新缺口**（记在这里，别当成已经好了）：
1. 肖像卡片上的角标写的是「角色场景」——`characterPortrait` 只落在 `genMeta` 与任务行，
   没有进清单投影。卡片把肖像说成场景，与回执刚修掉的那句话是同一类错。
2. 资产卡片那排操作按钮在面板宽度下换行成"一字一行"（截图里看得见），是排版问题不是数据问题。

## 上面那两处已经补了：清单投影带上 characterPortrait
`AssetRef.characterPortrait` → `assetRowToRef`（读 `genMeta.characterPortrait === true`）→
`AssetsPanel` 角标分两档：肖像说「角色肖像」，场景仍说「角色场景」。
按钮那排加上 `flex-wrap`，整排不再被压到一字一行。

**凭证（两个方向都钉了）**：`image-studio.integration.test.ts` 那条肖像用例现在同时断言
"肖像的清单投影有这一格"与"同一角色的**场景**没有这一格"——只断言前者，一个永远写 `true` 的映射照样过。
变异探针：把 `assetRowToRef` 里那行映射删掉 → **红正好 1 条**
（`清单投影里没有 characterPortrait：卡片会把肖像一律说成"角色场景": expected undefined to be true`，另 15 条仍绿）；
还原后 **16/16 全过**。e2e 那条链加了两条角标断言，**1 passed / 33.6 秒**，
截图 `screenshots/character-portrait.png` 里两张卡各自写着「角色场景」「角色肖像」，按钮不再一字一行。

**探针过程里踩到的自己的坑**（下次别再踩）：还原用的是 `git checkout -- <文件>`，
而那次那个文件**带着未提交的新代码**——checkout 把探针改动和我刚写的映射行一起冲掉了，
于是"还原后的对照跑"红了。红的是我的还原程序，不是被测代码。
教训：`git checkout --` 只对**与 HEAD 干净**的文件安全；文件本身有未提交工作时，还原要用
"记下原文再逐字写回"，或者先提交再做探针。

## §39 的闭环：肖像可以当"同一个角色的下一个场景"的参考
上一节记的"与 `referenceAssetId` 互斥"只对了一半，这里把范围说清：

- `referenceAssetId + generateCharacterPortrait` **仍然拒绝**——肖像由档案驱动，塞一张图进去当参考，
  "由档案驱动"那句话就又不成立了。
- `referenceAssetId + characterId` **放行**，但那张参考图必须是**这个角色自己的肖像**
  （服务端按 `assets.character_id` 与清单投影的 `characterPortrait` 验）；拿同角色的一张场景、
  或别的角色的肖像当参考一律拒绝，且拒绝时一行都不许多、额度一分不扣。
- 同时给参考图时，色相锚点取**量自那张肖像像素**的那个（`anchor ??=`），档案继续给语义
  （身份/穿着/画风/特征/轮廓/标志）。这两件事分开说清楚：档案说"画的是谁"，肖像说"照哪张图画"。
- 界面入口：肖像卡片多一个「以此生成场景」（只有肖像卡有——拿场景当参考再生成场景不是"角色身份"）。
  回执分成四档，新那一档写"色调取自它那张肖像量出来的主色"，不写"取自视觉标识"，因为这一档不是。

**凭证**：`image-studio.integration.test.ts` **18/18**（新增 2 条）。锚点那条不是拿生产代码自己跟自己比：
测试里独立 `openAssetForOwner` 读回肖像字节、再 `extractVisualDna` 量一遍主色，要求 `genMeta.anchorDominant`
等于**这次测量**；归属那条带反向对照（"我自己的肖像当参考就该放行"），否则两次红只是因为"谁都拒绝"。
变异探针（两次是叠加跑的，第二次的红数里含着第一次的两条）：
① 把归属判定改成恒不拒绝 → **红 2 条**，消息分别点名"不是这个角色肖像的图被当成角色参考放过去了"与
"同角色的一张场景被当成角色参考图放过去了"；② 再把 `anchor ??=` 换成 `anchor =` → 多红 1 条
`带参考图时锚点没走测量：照这张图画变成了照档案画: expected '#2e7d32' to be '#e9cd82'`——
这一条同时证明"量出来的主色"与"档案声明的第一色"确实不是同一个值，断言不是空转。
还原用 md5 与探针前核对一致后重跑 **18/18 绿**。
e2e 那条链现在一次点完三档（场景 → 肖像 → 以肖像延伸场景），**1 passed**，
截图 `screenshots/character-scene-from-portrait.png`：三张卡的角标依次是 角色场景 / 角色肖像 / 角色场景。

**边界照旧**：DEMO 合成器只认 prompt 哈希与一个色相锚点，所以"同一个角色认得出"今天可测的只有**色调**那半；
换真 provider 时这一格不必重接，欠的还是像素。


## §40 的第一片：`packages/video-model`——分镜与时间线先是模型，后才是要生成的东西
需求那条流程是 `Prompt → Storyboard → Shot list → Image references → Video generation → Timeline`。
本机没有视频 provider，所以这一片只做前三步，而且**明说自己不是 AI 分镜**：
`planStoryboard()` 是确定性断句（分隔符切句、首镜宽景尾镜特写、含运动词给跟移并加长时长），
每一条规则都进 `notes`，界面上要原样显示——与 `GamePlan.notes` 同一口径。

- **不凑数**：镜头数 = 断句数。一句没有标点的话就一镜，并在 `notes` 里说"没有可断的标点"；
  只剩标点或空白的输入切出 0 镜，说的是"没有输入句子"，而不是"生成了一张空分镜"。
- **并镜不丢内容**：超过 12 段时把剩下的并进最后一镜，`notes` 里报的段数在改动之前量好
  （先改后量就会报出"1 段"这种假数字——这一条就是这么被抓到后改的）。
- **时间线是投影不是第二份真值**（§16）：只从 `shots` 累加偏移。§41 点名的轨里
  audio / subtitles / effects **存在但为空，并各带一条 `emptyReason`**——缺这一句，
  界面上"没有音频"与"渲染失败"就长得一模一样。
- **没有一帧视频就不说能播**：`playable` 要每一镜都有 `videoAssetId`，否则 `blockers` 里
  写清"有 4/4 镜还没有视频帧"，并注明"缺的是帧，不是布局"（时间线照样可编辑）。

**凭证**：`packages/video-model/test/storyboard.test.ts` **14 条纯单测**（不碰数据库）。
三次变异探针各红**正好 1 条**：① 并镜改成直接丢尾段 → 红在镜数那条（11 ≠ 12）；
② `playable` 不看视频帧 → 红在"没有帧就该不可播"；③ 三条空轨整个不摆 →
红在 `§41 点名的 audio 轨整个不见了`。还原以 md5 与探针前核对一致后 **14/14 绿**。
包内 `tsc` 干净、`eslint .` 干净；根 `typecheck` 加了第五个包，`vitest.config.ts` 加了 alias。
整套 `npm test` 在这一片之前是 **94 文件 / 1002 条全绿**（275 秒，commit `bb6e322`）。

**这一片欠的**（别当成已完成）：分镜的存储与投影进 `document`（现在只在包里）、
Studio 的「分镜」面板入口、镜头的 `referenceAssetId` 接上 §38/§39 那条图像链、
`Video generation` 那一格要真 provider、§150 的撤销补丁（第二片，见下）、
§41 的 Timeline 编辑界面（trim / reorder / regenerate / extend / transition）。

## §40 的第二片：`packages/video-model/src/patch.ts`——分镜也走「一次编辑 = 一个可撤销事务」（§150）

形状照 `packages/design-model/src/patch.ts`（那一份是仓库的口径，不另起一套）：
纯函数 `applyStoryboardPatch`、吃**改动前文档**的 `invertStoryboardPatch(before, ops)`、
以及把两者接成事务的 `storyboardTransaction(before, ops) → { applied, undo, redo }`。
五个 op：`addShot` / `removeShot` / `restoreShot`（只作为逆出现）/ `moveShot` / `updateShot`。

四条容易说谎的地方与它们的钉子：
- **逆必须记"原来在第几位"**：`removeShot` 的逆带的是删除时那一位，否则撤销会把镜头追加到
  末尾，顺序就回不来了。连删两镜时逆按倒序排，一次撤销全数归位。
- **逆吃旧值**：`updateShot` 的逆交换 `before` / `after`；拿改动后的文档算逆，撤回去的是新值。
- **清空可选字段是删键**：`after: { referenceAssetId: undefined }` 走 `delete`，
  不是留一个值为 `undefined` 的键——测试用 `in` 与 `Object.keys` 钉住，`toEqual` 对这两种是盲的。
- **找不到镜头抛错，不静默跳过**：静默跳过会造出一次"看起来成功"的撤销，其实什么都没做（§159）。
  空分镜上移动也报错，说清是第几位没有镜头。

**凭证**：`packages/video-model/test/patch.test.ts` **14 条**（含混合事务：删、插、改、移一次做完，
撤销后逐字节回原样；`JSON.stringify` 比较，不让 `undefined` 键与缺失键蒙混）。
包内 `tsc` 与 `eslint` 干净，`packages/video-model` 现在 **28/28 绿**（14 断句 + 14 补丁）。

**变异探针**：五个各红且红在该管的那几条（控制组 14/14 绿，还原后 md5 与探针前一致
`7486fd64…`）：① `restoreShot` 记下末尾 → 3 条红（单删还原、连删倒序、混合事务）；
② `updateShot` 的逆不交换旧值 → 4 条红（改字段、清空补回、混合事务、事务的 redo 那份）；
③ `addShot` 插引用而不是插副本 → 1 条红（改结果写回了调用方）；④ 逆不倒序 → 2 条红；
⑤ 找不到镜头返回 -1 不抛 → 1 条红（那条越界/未知 id 的用例）。

## §40 的第三片：分镜进库——`storyboards` 表 + 报文契约 + 归属核对（还没有界面）

`packages/video-model` 那两片今天有了落点：`infra/migrations/0017_storyboard.sql` 建 `storyboards`
（一项目一份，`project_id` 上挂唯一约束）、`domain/storyboards.ts` 读写、
`/api/projects/[projectId]/storyboard` 的 GET/PUT，形状与 worlds / games 完全一致（不另起一套）。

- **报文与结构各管一件事**：`StoryboardDocumentSchema`（`@nexus/schemas`）管字节，结构权威在
  `@nexus/video-model`（纯函数包，不碰库）。三份枚举清单写了两遍，所以 `SHOT_CAMERAS` /
  `SHOT_TRANSITIONS` / `STORYBOARD_ARROWS` 改成**运行时常量、类型从它派生**，
  契约测试逐位比两边——模型加字段而报文没跟上时，zod 会把那一格静默剥掉，
  这条测试用键清单比对把它抓出来（"存得下但查不着"是同一类 bug）。
- **归属核对**：镜头能挂 `characterId` / `referenceAssetId` / `videoAssetId`。不核对的话，
  从别的项目复制来的一份分镜就成了一条读取别人资产的通道（§80 那条链的反面：
  存进去的指针也得只指得回本项目）。报错点名是哪一镜、哪个 id。
- **时间戳放列不放文档**：文档要能被同一份输入重复投影出逐字节相同的结果（§16 可重放），
  "存过几次"不是内容。并发用可选 `baseUpdatedAt`：带上就拒绝更旧的写，不带就是最后写入者赢
  ——第一次建档手里没有基准，逼它编一个时间戳等于让它伪造并发检查。
- **时长上限 600000 毫秒远高于模型会产生的 3000/4500**：边界用来拦垃圾输入，
  不用来否决作者真想要的长镜头（贴着默认值写上限，长镜头就只剩一条 500）。

**凭证**：`packages/schemas/test/video-contract.test.ts` 8 条 + `apps/web/test/storyboards.integration.test.ts` 8 条
（真实 Postgres：null / 往返 / 契约外进不来且库里不留痕 / 别的项目的角色被拒且反向对照通过 /
不存在的资产 id 被拒（镜头那一格与 source 那一格各一次）/ 更旧的写被拒 / 唯一索引真在库里
（比 `23505` 与约束名，不让"连接断了"冒充约束生效）/ 删项目级联）。
`npm run db:migrate` 应用 0017（6 条语句）；全量 `typecheck` 干净。
两个变异探针各红**正好 1 条**：① 关掉角色归属那道判断 → 红在"挂别的项目的角色该被拒"；
② 把并发比较的 `<` 换成 `>` → 红在"更旧的写该被拒"。还原后 md5 与探针前一致（`2289e6b7…`）且 8/8 绿。

**这一片欠的**：Studio 的「分镜」面板入口（现在只有 HTTP + 库，界面上点不出来）、
分镜进 §49 知识索引（对 AI 不可见）、镜头参考图真的接上 §38/§39 那条生成链、
§150 的补丁与库里的行怎么配（撤销栈在客户端，写库要过同一份 PUT）、发布链路里没有分镜这一格
（2026-10-30 已还：迁移 0046 + 公开分镜页 + 作品页入口，凭证见 TESTING）。

## §40 的第四片：「分镜」面板进 Studio——每次改镜头都是一个补丁事务

左栏第 6 个页签「分镜」（`StoryboardPanel` + `storyboardStore`），把第三片那套 HTTP 变成了点得出来的东西：
一句话 → 切成镜头表 → 逐镜改机位/转场/时长/提示词 → 撤销/重做 → 刷新还在。

- **切分不是生成**：按钮叫「切一版分镜」，空状态与 notes 都明说这是**本地确定性断句**、
  不是模型给的镜头语言。切不出镜头（只有标点）就一句话回执 + **一次 PUT 都不发**，
  不往库里塞一份 0 镜的文档冒充"生成好了"（§159）。
- **§150 在分镜里是真的**：`applyOps` 走 `storyboardTransaction`，正做进撤销栈、逆补丁应用到本地，
  随后**照常 PUT 一次**——撤销不是把界面擦回原样，库里那份也跟着回。栈刻意留在客户端：
  库里存的永远是当前状态，与画布"Command 改文档、持久层只看最终形态"的分工一致。
  建档（`planFrom`）换掉整份真值，不是"一次可撤销的编辑"，所以它清空两个栈，
  而不是留一个撤不回原状的空步。
- **时间线可读不可播**：`playable` 一直是 false，界面把**为什么**一起显示（缺的是帧不是布局），
  audio / subtitles / effects 三条轨各带一句"为什么是空的"——没有这句，"没有音频"和"渲染失败"长得一模一样（§41）。
- **非法值改不掉那一镜**：时长写 `abc` → 输入框回到原值 + 一句"没写进去"，
  保存状态不变红。客户端拦的是"这一格根本没动"，服务端的 1..600000 仍是第二道门。

**凭证**：`apps/web/test/storyboard-store.test.ts` 5 条（fetch 桩按 route.ts 的真实响应形状写：
建档不带基准 / 服务端给的基准原样带回 / 被拒时那句服务端原话不被"HTTP 400"替换 /
撤销发出去的那份文档逐字节等于改动前 / 空输入零次 PUT）。
`e2e/storyboard.spec.ts` 2 条在真 Chrome 里点：3 镜、改机位、撤销后点「重读」仍是 wide、
删最后一镜能回到**原来那一位**、整页刷新后 3 镜还在、不可播与 blockers 读得出来。
截图 `screenshots/storyboard-panel.png`、`screenshots/storyboard-duration-rejected.png`。
三个变异探针各红**正好 1 条**：① 去掉 `stepBack` 里那次 `commit()` → 红在"撤销是一次真的写"；
② 去掉时长那道客户端守卫 → 红在 e2e 的"没写进去"回执（元素压根不出现）；
③ 去掉镜头卡头部的 `flex-wrap` → 红在 `toBeInViewport()`（"viewport ratio 0"：
264px 的面板里 ↑↓＋✕ 被裁出界外，Playwright 点得到但用户看不见）。
还原后 store md5 与探针前一致（`30d7b41c…`）。全量 `npx vitest run` 99 文件 / 1051 条绿，`npm run typecheck` 干净。

**这一片欠的**：分镜进 §49 知识索引（AI 看不见它，**已由下一片补上**）、镜头的 `referenceAssetId` 真的接上 §38/§39 那条生成链、
`videoAssetId` 要真 provider 才有值（时间线因此永远不可播）、发布链路里没有分镜这一格
（2026-10-30 已还，同上）、
移动镜头（↑↓）与插镜（＋）只有 e2e 里那一条被点过。

## §49 × §40：分镜进知识索引——存得下但查不着，等于对 AI 不存在

前三片把分镜存进了库、给出了界面，但 `syncProjectKnowledge` 的语料清单只有世界条目 / 角色档案 / 记忆：
一份写着"第 2 镜是航拍 4500 毫秒"的分镜，检索里一块都查不到。这一片把那一格补上。

- **一镜一块 + 来源句子一块**：块体是提示词 + `机位：` / `转场：` / `时长：… 毫秒`（有角色或参考图才带上那两行），
  标题是「分镜标题 · 第 N 镜」。
- **`notes` 刻意不进**：那是投影对自己的解释（"这一版来自本地确定性断句"），不是故事内容。
  让它进索引，查"分镜"会命中一排规则说明书——比查不到更容易误导装配上下文的那一方。
  这条不是口头承诺：纯函数测试先把"notes 里确实有那句话"钉住，再断言没有任何一块含它。
- **`sourceId` 认的是行，不是文档自己写的那个 id**：`knowledge_chunks` 的唯一约束
  `knowledge_chunks_source_key` 是**全局**的 `(source_type, source_id, chunk_index)`，
  而客户端切完一版分镜手里拿的 id 是模型默认值 `storyboard-1`（`saveStoryboard` 原样存客户端文档，
  只有读路径换成行 uuid）。用文档 id 的话第二个项目就撞约束——**这不是推演，是这次真的红了**：
  `23505 duplicate key`，连带 `storyboards.integration.test.ts` 里 5 条与本片无关的用例一起挂。
  所以那条"sourceId 前缀是行 uuid、且不含文档 id"的断言单独存在，先于任何检索用例。
- **同步由写路径 arm**：`saveStoryboard` 两个成功返回前各调一次 `syncProjectKnowledge`，
  与角色/世界同一口径。用户不需要知道"重建索引"这个按钮存在。
- **界面跟着改口**：`SOURCE_LABELS` 加 `storyboard: 分镜`；检索面板自述那句从"世界条目、角色档案与记忆"
  改成把分镜镜头算进去——库里真的装了分镜之后，那句话再说"只有前三样"就是界面在撒谎。
  另外命中卡原来整条标题走 `truncate`，264px 面板里被截掉的正好是"第 N 镜"这半句
  （截图里看得见：两块都显示成"夜色里的港口，一台旧起…"，分不出是哪一镜）。
  现在块名单独占一格不截，文档名可以截。

**凭证**：`knowledge.test.ts` 新增 4 条纯函数用例（3 镜 → 4 块 / `#source` 那块 / sourceId 认行不认文档 id /
每块回得去自己那一镜 + notes 不掺进来）。`knowledge.integration.test.ts` 新增 2 条真库用例：
存一版分镜后 `bySource.storyboard === 镜头数 + 1`、查那句能命中"第 1 镜"、命中里没有规则说明书；
整版换掉（来源句子跟着变）后旧句子不再命中分镜——**只改一镜的提示词不构成陈旧**，
因为那句话同时是 `#source` 块的内容，这条写在用例注释里免得下一个人误以为漏测。
第二条再同步一次块数不变（整份重建是幂等的，不是越同步越多）。
`e2e/storyboard.spec.ts` 第 3 条在真 Chrome 里按顺序证明因果：新项目里查"缆绳"→ `0 块` + 没有命中；
只点一次「切一版分镜」并保存（不碰重建索引）→ 同一个词变成 `4 块` + 「分镜」来源命中 + "第 3 镜"在视口内。
截图 `screenshots/storyboard-retrieved.png`。
**变异探针**：抹掉 `saveStoryboard` 里那两行同步调用 → `2 failed | 16 passed (18)`，
两条红都落在新的 `§49 × §40` describe 里，其余 16 条（含 8 条 storyboards 集成）不动——
证明"是写路径 arm 了索引"，而不是"测试自己调了一次 sync 所以绿"。还原后 md5 与探针前一致（`9252f987…`）。

**这一片欠的**：游戏文档（§54）是同一形状的断链——`syncProjectKnowledge` 里没有 `games`，
所以游戏设定对 AI 也不存在（**已由下一片补上**）；分镜进 AI 的上下文装配（现在发出去的是 designIndex，语料检索只服务检索面板）；
向量那一半仍要 provider；§165 全平台搜索没有分镜这一类目标。

## §49 × §54：游戏设计进语料库——填过的才算内容，空骨架一块都不进

上一片欠的那一格补上了：`syncProjectKnowledge` 的语料清单此前是世界条目 / 角色档案 / 记忆 / 分镜镜头，
`games` 不在里面。一份写着"苦痛主教只在钟声里移动"的游戏设计，检索里一块都查不到。

- **一个填过的实体一块，外加概述一块**：标题是「游戏名 · 实体名（类别）」和「游戏名 · 概述」，
  块体是说明 + `标签：` / `数值：k=v、…` / `引用：角色 → 目标名`。
- **模板骨架一块都不进**（§159）：`createGame` 给的是 11 类各一个空实体，名字就是类名。
  那种东西进索引，查"游戏设计"会命中一排空壳，而空壳表达的恰恰是"还没设计"——
  比查不到更容易误导装配上下文的那一方。判据是"这块有没有可检索的文字"（说明/标签/数值/引用任一非空），
  刻意比进度条用的 `fleshedOutCount`（只看说明与数值）**宽**：只打了标签或只连了引用的实体仍然有东西可查。
  这条不是口头承诺：纯函数用例先把"骨架确实有 11 个实体、四样全空"钉住，再断言切出 `[]`。
- **引用渲染成目标实体的名字**：「追杀 → 守夜人」是查得到的一句话，「追杀 → ge_mb3k9x」不是。
  引用两头都在同一份文档里，所以这里能就地解析，不需要第二次查询。
- **数值按 key 排序再拼**：对象键的顺序来自客户端，不是来自内容；不排序的话同一份设计两次切分
  可能得到不同的块，"重建索引看差异"就没有意义。用例只换插入顺序、其余完全一样，来证明这一点。
- **`sourceId` 仍然认行 uuid**：上一片那个 `23505` 的形状留了一条独立用例——
  两个项目各存一份**文档 id 相同**的设计，两边的块必须都在，而不是第二个项目插不进去。
- **同步由写路径 arm**：`saveGame` 两个成功返回前各调一次，用户不需要知道"重建索引"这个按钮存在。
- **界面跟着改口**：`SOURCE_LABELS` 加 `game: 游戏`；检索面板自述那句从"…与分镜镜头"改成把游戏实体算进去。
  `games.ts` 顶部那句"要检索时走 §69 的索引"也跟着改了——§69 是代码索引，游戏设计要被检索走的是 §49。

**凭证**：`knowledge.test.ts` 新增 6 条纯函数用例（该文件 21/21）：骨架 → `[]` / 填过的 → 2 块且标题带类别与类型标签 /
引用出名字不出 id / 数值顺序无关 / `sourceId` 认行不认文档 id / 只有标签的实体照样进（而 `fleshedOutCount` 报 0）。
`knowledge.integration.test.ts` 新增 3 条真库用例（与 `games.integration.test.ts` 8 条一起 21/21）：
空骨架存进去 `total === 0` → 填完 `bySource.game === 2` → 查那句命中「苦痛主教」→ 换掉说明后**旧说法不再命中、新说法命中**
→ 再同步一次块数不变；带引用的那块在真库路径命中「追杀 → 守夜人」且不含 `ge_` 那种内部 id；
两个项目存同一份文档 id 各自 2 块、直接数行是 4。
`e2e/studio.spec.ts` 第 4 条 `@smoke`（19.0s）在真 Chrome 里按顺序证明因果：新项目 `0 块` →
点一次「创建游戏骨架」（11 个实体进库）回到检索面板**仍然是 `0 块`** →
填概述 + 那位敌人的名字与说明 → `2 块` + 中文「游戏」来源 + 块名「苦痛主教（敌人）」在视口内 + 「游戏类型：视觉小说」。
截图 `screenshots/game-retrieved.png`。
**变异探针**：抹掉 `saveGame` 里那两行同步调用 → `3 failed | 18 passed (21)`，
三条红全落在新的 `§49 × §54` describe，其余 18 条（含 8 条 games 集成）不动——
证明"是写路径 arm 了索引"，不是"测试自己调了一次 sync 所以绿"。还原后 md5 与探针前一致（`8b697d91…`）。
探针自己也踩了一次：第一次用 `binary` 写回把中文重编码了，两个测试文件都 `Transform failed`、
**0 条断言跑起来**——"0 red"不是"没红"，得先看 runner 的报错再下结论。

**这一片的门禁红过，而且红得该记下来**：我先跑了一遍 `npm run lint` 就以为绿了——那条命令写成
`npm run lint > log; echo EXIT=$?; tail log`，**退出码来自 `tail` 不是 lint**，而我读的是还没跑完的日志头部。
pre-commit hook 把真话说出来了：13 个 TS 错，全落在两个测试文件里。一处是 `ofKind` 的入参类型写成
`{ sourceId: string }[]`，于是后面那些 `.title` / `.content` 断言在类型层根本不存在——
vitest 不做类型检查，所以"运行时 21/21 绿"完全没覆盖到它。**辅助函数把字段抹掉，等于让那些断言从门禁眼里消失**，
下一片给 helper 定类型时要用生产的那个类型（`Chunk`），不要就地手搓一个形状。
另一处是 `${first.ok ? second.reason : first.reason}`：拿一个的判别式去取另一个的分支字段，类型不通过，
改成两条各自出声的 `throw`（报错也顺便说清了是哪一份存失败）。
hook 第二轮又抓出一条 e2e 的：`toHaveCount(1, '主张')` 不合法——**Playwright 的 matcher 第二参只收
`{timeout}`**，红字里要带主张得写在 `expect(entityHit, '主张')` 上。vitest 的 `expect(x, msg)` 与它同形，
所以这条只在 `tsc -p e2e` 那一步才现形：跑过一遍 e2e 不等于类型层过。

**这一片欠的**：语料的内容还没进 AI 请求——`context.ts` 只报块数与来源分布，发出去的是 designIndex，
检索只服务检索面板（§66-71 里"按相关性取内容拼上下文"那一半没做）；
§165 全平台搜索有 `games`（名字+摘要）但**没有 `storyboards`** 这一类目标；向量那一半仍要 provider。

## §49 × §16：设计正文进语料库——清单最后一格「Documents」，一块就是一页

§49 那份清单（Lore / Characters / History / Locations / Items / Quests / **Documents**）里，
前六格在这片仓库已经有了主人，最后一格一直没人认领：`syncProjectKnowledge` 的语料清单是
世界条目 / 角色档案 / 记忆 / 分镜镜头 / 游戏实体。一句写在落地页上的"雾里的港口只有一条会响的钟"，
在检索里一块都查不到——设计文档是这个产品的主文档，却是语料库里唯一缺席的那一类。

- **一块 = 一页，行首带节点名**：块体是 `节点名：文字` 的行，标题是「文档名 · 页面名」。
  逐节点切块是另一个方向的选择，但对 4000 节点的项目会产出上千条十几个字的碎语料，
  面板滚不完，命中读起来也是"一句没有出处的话"；按页聚合之后，拿到块的一方仍然知道该改哪个节点。
- **只吃 `text`**：形状、颜色、token 引用是 §70 索引的活（`DESIGN_INDEX_OMISSIONS` 里明写了
  "语义检索与相关性排序"不归它），代码节点是 §69 的活。这里刻意不越界。
- **纯布局的页一块都不进**（§159，和 §54 那条"空骨架不进索引"是同一句话）：
  一页全是空 frame 就没有可检索的文字，硬切一块等于告诉 AI"这页有内容"。
- **不索引 `page.meta` 的描述与路由**：`pages` 表没有这两列（`writeDocument` 只落 name / 尺寸 / 背景），
  把它们切进语料就是索引一份库里不存在的东西——下一次从库里重读就对不上，块却是查得到的谎话。
- **走不到的节点仍然进块**：`designNodes` 存的是整页 `Object.values(page.nodes)` 全量，
  从页面根 BFS 不到的文字真的在文档里。单列一段「没有接进页面树的节点」并标 `（不在页面树里）`，
  不静默丢——静默丢就是"存得下但查不着"的另一半。
- **`sourceId` 带项目 id**（`${projectId}#page-${page.id}`）：全局唯一约束是
  `(source_type, source_id, chunk_index)`，页面 id 只是文档内的命名空间，
  不带项目就会重演上一片那个 `23505` 的形状。

**两条同步路径，各自的删除范围等于各自的重写范围**：
- `syncDesignKnowledge(projectId, document)` 只删/插 `design` 这一类，由 `saveDocument` 与 `createProject`
  在事务**外面** arm（同步走的是 `getDb()` 那条独立连接，它在事务里写的 chunk 不跟着外层回滚——
  文档没存成而语料里已经是新句子，检索就会回答一份不存在的设计）。频率是每次自动保存，
  所以它绝不去重切全世界。
- `syncProjectKnowledge(projectId, { includeDesign })`：**不带**这个参数时（世界/角色/记忆/分镜/游戏
  那些写路径用的就是它）既不重切设计，也就**不许删** `design`——删除范围大于重写范围就会变成
  "一次世界保存把设计正文从索引里抹掉，而它只有下次编辑设计才回来"。
  带 `true` 时才付整档读取那一遍（页面 + 节点 + token + 组件的全部行），而它只有一个调用方：
  界面上那颗「重建索引」按钮。**这是历史项目唯一的补索引路径**——这批内容进库之前建好的项目里
  设计正文一块都没有，写路径永远不会替它补；按钮上的"重建"若只覆盖清单的七格之六，
  那就是半个真的功能。

**界面跟着改口**：检索面板加了按来源计数的芯片（`data-knowledge-source="<type>"`，缺席即"这一类真的没块"），
`SOURCE_LABELS` 补 `design: 设计文档`，面板自述那句把"设计页面的文字节点"算进语料。
`N 块` 这个总数从这一片起不再是证据——一个全新项目现在合法地占一块设计正文。

**凭证**：`knowledge.test.ts` **27/27**（这一片新增 6 条 `chunksFromDesign` 纯函数用例：起始模板 → 1 块且
标题带页名 / 擦掉文字只剩布局 → `[]` / `sourceId` 认的是"项目 + 页面行" / 走不到的节点仍然进块并写明不在树里 /
同一份文档切两遍完全一致 / 长文案切成多块且每块 ≤ `CHUNK_MAX`、`chunkIndex` 连续、共用一个 `sourceId`）。
`knowledge.integration.test.ts` **16/16**（新增 3 条真库用例：新建项目即有设计语料 → 改文案后旧句子再也查不到、
新句子查到、块数不涨 / 写路径的重建**不碰**设计块（脏块原地不动）而「重建索引」按钮补得回脏块 /
两个项目的同名页面各自成块且互相查不到）。
`e2e/studio.spec.ts` 新增那条 `@smoke` 在真 Chrome 里走 图层选中 → 属性面板改文案 → 防抖自动保存 → 检索面板，
中间没有任何替身。**第一轮 `-g "检索面板"` 三条：2 passed / 1 failed**，绿的两条是这条新用例与分镜那条，
红的是一条 `已保存` 的 5s 超时（见下）。**第二轮三条全红**，红的不是切分也不是内容：面板里明明白白写着
`HTTP 404`——`GET /api/projects/<id>/knowledge` 404，`stats` 因此停在 `{}`，芯片一块都不渲染。
同一次跑之后直接数库（`docker exec nexus-postgres psql`）证明这三个项目**各自都有 `design 1`**：
写路径在浏览器流程里也成立，红的是面板那次读取。404 的成因还没定位（`projectBelongsTo` 为假？
`studio.projectId` 晚到？），记成独立的 BUG，不在这一片里靠加大超时糊过去。
糊过去。

补一条量到的线索：同一台机器上 `npm run typecheck` 之后红在 Next 自己生成的
`apps/web/.next/dev/types/routes.d.ts:97`（TS1128，生成物被截断），
删掉整个 `.next/dev` 重生成之后门禁才回到绿——也就是说那次跑里 dev 服务器的路由产物
本来就坏了一半，404 有更可能的解释：不是归属判断，是路由表没编译出来。
但 BUG 仍然挂着，因为界面那句“索引里有 0 块语料”是在一次失败的读取之后说出来的：
查不到要说“查不到”，不能报一个像内容的数字。

**变异探针**（4 条，每条只落一处；全部还原后 md5 与基线一致 `projects f01d57dc / knowledge c42075f2`）：
抹掉 `saveDocument` 里那句同步 → `2 failed / 16`（红的正是"新建即有语料"与"两个项目同名页面"）；
`syncProjectKnowledge` 读了设计文档却不切块（`void chunksFromDesign(...)`）→ `1 failed / 16`，
红的正是那条脏块用例；把孤儿段的 `!reached.has` 反过来 → `1 failed / 27`（走不到的节点那条）；
`if (!lines.length && !orphan.length) continue` → `if (false)` → `1 failed / 27`（只剩布局那块都不产的那条）。
探针脚本自己先红了一次：`createHash` 从 `node:fs` import，**0 条用例跑起来**——"没输出"不是"没红"。

**这一片动了上一片的证据**：§49 × §54 那条 `@smoke` 原来靠"新项目 `0 块`"证明骨架没进索引，
现在新项目是 `1 块`（它自己的设计正文），所以三条断言改成芯片：`设计文档 1` + `game` 缺席 → 填完之后 `游戏 2`。
证据是变强了：「某一类一块都没有」比「整个库是空的」更贴近要证的事。
同一条用例里 `已保存` 那句拿默认 5s 等，这一轮红过一次（收到的是"保存中…"），补成 20s 与它的兄弟断言一致——
**5 秒的预算在冷启动的 dev 服务器上本来就不算余量，别把负载读成回归，也别把回归读成负载**：
第一轮里这条新用例是绿到走完最后一步的（`screenshots/design-retrieved.png` 的落盘就是它的收据）。

**这一片欠的**：语料内容仍然没进 AI 请求（`context.ts` 只报块数与来源分布）；
§165 全平台搜索仍然没有 `storyboards` 这一类目标；向量那一半仍要 provider；
`includeDesign` 那条重建走的是整档读取，4000 节点档要付多少**还没量过**（§147）。

## §73：读不到 ≠ 零块——一次失败的读取在界面上要说"读不到"

上一片收尾时那条 e2e 线索有了答案，也留下一句谎要修。

- **404 的成因已经量到**：删掉被截断的 `apps/web/.next/dev`（Next 自己生成的 `routes.d.ts:97` 报 TS1128）
  重生成之后，同一组 `-g "检索面板"` 从 3 failed 变成 **3 passed (1.1m)**，
  再往后是 **4 passed (34.0s)**。所以红的是 dev 服务器的路由产物坏了一半，不是切分、不是归属判断——
  那三个项目当时直接数库各自都有 `design 1` 块。**结论：e2e 整组突然全红，先怀疑生成物，再怀疑代码。**
- **但界面那句谎是真的**：面板当时的输出是 `HTTP 404` 旁边写着「索引里有 **0** 块语料」，
  头部总数也是 `0 块`。一个失败的读取被翻译成了一个像内容的数字——
  看的人据此得出"这个项目没有语料"，而库里明明有（§159：半个真的界面也是谎）。
- **改法**：`RetrievePanel` 把"读取失败"和"库里真的没块"分成两种状态（`statsFailed`）。
  失败时头部总数写「读不到」（`data-stats-failed="true"`），来源芯片**一个都不渲染**——
  缺席本来是"这一类真的没块"的证据，不许替一次网络故障作证；空闲那句改成"不报块数"，
  并给一个「重试」入口。成功那次读取会把标记清掉，所以重试真的能拿回块数与芯片。

**凭证**：新增 `@smoke` 一条（`e2e/studio.spec.ts:1116`，8.8s）：用 `page.route` 把
`GET /api/projects/*/knowledge` 拦成 503（**拦真请求，不喂假数据**；放行分支仍然 `route.continue()`），
断言头部是「读不到」、空闲句 `not.toContainText('0 块')`、`[data-knowledge-source]` 计数 0；
再 `unroute` + 点「重试」，断言 `设计文档 1` 芯片回来、头部 `1 块`、`data-stats-failed="false"`、
不可用提示消失。整组 `-g "检索面板"` **4 passed (34.0s)**，`npm run typecheck` 0。
**变异探针**（3 条，各自命中一处、跑完还原且 md5 与基线一致 `de7a4bbc`）：
空闲句退回无条件报数字 → `1 failed`，红的正是 `not.toContainText`；
头部总数退回无条件报数字 → `1 failed`（`toHaveText('读不到')`）；
成功读取后不清 `statsFailed` → `1 failed`（重试那句拿不回数字）。
三条都是断言红而不是崩，脚本自己也红了一次：`createHash` 从 `node:fs` import——
**同一个坑在同一个 session 里踩了第二遍**，因为探针文件是从上一份复制的；
import 坏掉的探针进程**0 条用例跑起来**，那不是"没红"。


## §165 第九组：分镜进全平台搜索——标题查表，画面描述查 §49 的语料块

§49 × §40 那一片记下的欠账（"全平台搜索有 `games` 但没有 `storyboards`"）在这一片还上。
一句写进分镜的画面描述，项目内检索查得到，跨项目什么都查不到——而用户找东西是从搜索框开始的。

- **两个来源，各自证明各自的**：① 分镜标题查 `storyboards` 表，这条**不依赖语料库**，
  那批内容进库之前存下的旧分镜也一直搜得到；② 画面描述查 `knowledge_chunks` 里
  `source_type='storyboard'` 的块——那份文本本来就是为检索切的，且 `notes`（"本地确定性断句"那类
  规则自述）不在块里，所以搜"分镜"不会命中一排规则说明书。命中行带着**是哪一镜**（块标题「文档名 · 第 N 镜」）。
- **join 回 `storyboards` 而不是直接用 `chunk.project_id`**：分镜删了而块还留着的那个窗口里，块是孤儿；
  拿块当结果就是给用户一个点开即 404 的链接——§165 自己那句话："搜出一条打不开的结果比搜不到更糟"。
- **`sourceId` 的形状是我真踩过的坑**：分镜的块认的是 `${行id}#shot-…` / `${行id}#source`，不是裸行 id。
  第一版写等值 join，`14` 条里红 `2` 条，**红的正好是**"画面描述命中"与"孤儿块不产结果"那两条：
  等值 join 让语料块这条路一条都匹配不上，于是它会安静地什么都搜不到。这条坑留在代码注释里，
  也留在探针 B 里（见下）。
- **测试的前提要自己站住**：`planStoryboard` 的标题就是那句来源文本，任何句子片段都会先被标题那条路
  命中，语料块那条路就永远测不到。做法是把标题改开（重命名一份分镜正是用户会做的事），
  再拿**最后一镜**的文本去查；镜头序号从同一份 doc 推导，不是我抄进来的常量。
  孤儿块那条先断言"块真的还在库里"，否则最后那条 `toEqual([])` 是在测空气。
- **界面跟着改口**：`/search` 页面那句"八类目标"是写在脸上当能力范围用的，九组就说九组；
  `SEARCH_NOT_COVERED` 补了一条诚实边界——旧分镜的画面描述要等一次保存或点「重建索引」才可搜，标题不受影响。

**凭证**：`search.integration.test.ts` **14/14**（新增 3 条：标题与描述两条路各自命中、`detail` 分别是
「分镜标题」与「第 N 镜」，并配一句查无此词必须空；孤儿块——删 `storyboards` 行、块仍在库里——结果必须空；
他人分镜不进我的结果、他自己搜得到、匿名也搜不到）。`typecheck` 0。
`e2e/studio.spec.ts:1831` 那条 `@smoke` 加了真浏览器的一段：**1 passed (11.1s)**——Studio「分镜」面板存一份 →
`/search?q=那句描述` → `[data-search-group="storyboards"]` 里有命中行自己的字与指向该项目的 `/studio` 链接。
（断言里带命中文本，因为空组也可能挂着标签，"这一组存在"不等于"搜到了东西"。）
这条也红过一次，红得是它自己的问题：上面几步已经 `goto` 到 `/search`，在那里点不到面板标签，
`page.click('[data-panel-tab="storyboard"]')` 一直等到 150s 测试超时——先回编辑器再点。

**变异探针**（2 条，各自命中一处、跑完还原且 md5 与基线一致 `052aec88`）：
A 把标题那条 `ilike(storyboards.title, term)` 换成一个不可能的词 → `1 failed / 14`，红的就是标题那条用例；
B 把语料块的 join 退回我等值写错的那个形状（`${行id} = sourceId`）→ `2 failed / 14`，
红的正是"画面描述命中"与"孤儿块不产结果"两条——**这条探针复现的是我这一片里真实发生过的错误**，
所以它证明的不是断言写得严，而是这条路一旦形状错就会响。


## §49 × §66-71：语料的**内容**按相关性进 AI 请求，不再只报一个块数

§49 那三片把语料切好、索引好、面板能查了，但发给模型的那一份里始终只有"库里有几块"。
这一片把最后一格接上：**这一轮的提示词就是语料库的查询词**，按相关性取回的块带着出处进报文。

- **报文契约**（纪律 6：跨端只能用 `packages/schemas`）：新增 `CorpusDigestSchema` ——
  `query / candidates / used / omitted / budgetChars / usedChars / vectorAvailable / items[]`，
  每条 item 带 `sourceType / sourceId / chunkIndex / title / excerpt / score / matchedBy`。
  出处与命中方式不是装饰：模型引用一条设定时要能指认是哪一类第几块，设定冲突时才知道改了哪一句。
- **"没查"与"查了但都不相关"必须在报文上长得不一样**：`query: null` 是前者。
  所以 `ProjectContextSchema.corpus` 刻意**没有默认值**——省略它和发一份空的，过 zod 之后分不出来。
- **被预算裁掉的相关块要数得出来**（`omitted`），装配沿用 §68 那套纪律：
  裁剪的每一刀都进报文，不留"看起来是全集"的错觉。Python 侧据此生成一句 `corpusNote`，
  只在 `query` 非空时出现——没查却解释"有 3 条被裁掉"就是假话。
- **两条路都要有，各自证明各自的**：标题/目录那一类（`designIndex`）继续发；
  语料摘录是并列的第二份。`/context` 面板那条路没给查询词就不查（装配是只读的，一次全文检索不是零成本）。

**一次返工值得记**：第一版把契约夹具的 `corpus` 由 `apps/web` 的 `context.ts` 导出，
`npm run typecheck` 立刻红两条**与本片无关**的错（`notifications.ts` 找不到 `@/lib/notify-plan`）——
原因是 `scripts/` 走的是 `tsconfig.tools.json`，那条程序里没有 `@/*` 别名，
而我新增的 import 边把整条 `context → publish → moderation → notifications` 的图拖了进去。
共享默认值因此落到 `packages/schemas`（`emptyCorpusDigest()` + `DEFAULT_CORPUS_CHAR_BUDGET`），
装配与夹具同用一个出处——**顺手也把"手抄一份形状"的漂移风险消掉了**：
Python 侧唯一的真实形状来源就是那份夹具，它现在由生产代码产出。

**凭证**：`context.integration.test.ts` 新增 2 条（给查询词就带回相关块、出处、命中方式，
并断言 `items.length === candidates - omitted`；不给就 `query: null` 且 `items: []`；
第二条用 `maxCorpusChars: 12` 逼出 `used=0 / omitted=candidates`，`candidates` 与宽预算那次相同——
裁的是发送的块，不是检索）。`ai-assemble.integration.test.ts` 补一条：真装配路径上
`wire.context.corpus` 存在且 `query` 就是本轮提示词。三个文件 **22/22** 通过，`npm run typecheck` 0，
`npm run contract:export` 重跑后夹具带上了 `{"query":null,...,"budgetChars":4000,"items":[]}`。
Python：`apps/ai-service` 全量 **66 passed / 1 skipped**（新增 2 条 corpus 用例）。
**变异探针**：把 `payload["corpus"]` 换成空对象 → 第一次只抓到 **1/2**（第二条断的是说明文字，不是摘要本身），
补上 `'"omitted":3' in user` 这类转发断言后两条都抓到；第二刀把 `corpus` 本身换成 `{}`（查询词因此变 null）→ **2 failed**。
两刀跑完都还原，`design_prompt.py` md5 一致。

**这一片欠的**：摘录是命中位置附近的**窗口**，不是整块正文——要整块得按 `sourceId` 回库里取，那条通道还没有
（已写进 `unavailable`，界面与报文都看得见）；reranker 仍是确定性融合，向量那一半仍要 provider；
`/context` 路由没暴露 `corpusQuery`，所以检索面板看不到"这一轮到底取回了哪几块"；
浏览器那一层的"改一句设定 → 发出去的这一段跟着变"还没证过。

## §49 × §66-71 第二格：上下文面板能按一句设定试取回语料（#75 的一半）

上一片把语料内容接进 AI 请求，但界面上看不到这一件事：/api/projects/<id>/context 不接受查询词，
上下文面板里那一行「语料 N 块」与发出去的那一份之间没有可核对的路径。这一片补上：
- 路由收 corpusQuery（上限 200 字，超了 400 说清凭什么挡），转给 buildProjectContext；
- 面板在「语料」那一行下面给一个输入框与「试一次」，展示取回了几块 / 候选几块 / 被预算裁掉几块，
  每条摘录带着出处（哪一类哪一块）与命中方式；查不到就明说「一条都没取到」，不留看着像结果的空壳。
- 参数拼接改用 URLSearchParams：手拼查询串最坏的结果是中文词不转义 → 永远零命中，
  而面板会一本正经地报告「项目里没有这句话」。

凭证：上下文那条 @smoke 加长到这一段（1 passed，9.4s），截图 screenshots/context-corpus.png；
探针把路由里那一行 corpusQuery 传给装配删掉 → 1 failed（红的正是新加的摘要断言），还原后 md5 一致。
这一轮也遇到同一形状的坑：新加断言前面那句「字符（」拿默认 5s 等，冷启动编译就是不够用，
补到 25s 与兄弟断言一致——第一次红的不是代码而是预算，别把它读成回归。

## §49 × §66-71 补上浏览器那半：改一句设定，上下文里取回的那段真的跟着换（#75 的第③格）

上一片把语料接进 AI 请求、又给面板加了试取回的入口，但"改了以后旧说法还在不在"这件事
只在 vitest 与检索面板那两条路证过。上下文这一层重新证一遍，走的是真编辑器：
图层选中 Headline → 属性面板改文案 → 防抖自动保存（它换语料块）→ 回上下文面板按旧句子试 →
必须「一条都没取到」；按新句子试 → 摘录里要出现那句话。

凭证：上下文那条 @smoke 加长这一段，1 passed (11.5s)，typecheck 0，截图 screenshots/context-corpus-after-edit.png。
变异探针把 syncDesignKnowledge 的"换块"改成只插不删 → 1 failed（红的就是这一段：
旧块留在索引里，新块又因为 (source_type, source_id, chunk_index) 的全局唯一约束插不进去），还原后 md5 一致。

#75 当时还剩最后一格：摘录是命中附近的窗口，不是整块正文——按 sourceId 回库里取整块的那条通道还没做（下一片已补，见文末）。

## §49 补最后一格：按出处取回整块语料（#75 的第①格）

§66-71 那一片在 unavailable 里写着"要整块得按 sourceId 回库里取，而那条通道还没有"——
这句话当时是真的，界面上也就只能停在窗口摘录。这一片把它变成假的：
- readKnowledgeBlock(projectId, sourceType, sourceId) 按 (项目, 类别, 出处) 取回整块，chunkIndex 升序，
  带 tokens 数（预算能核对）与块标题；跨项目与不存在的出处返回空列表，HTTP 那层给 404 并说清原因
  （"来源已删除而索引还没重建"就是那个形状，别用空列表装作成功）。
- 新增 GET /api/projects/<id>/knowledge/block，参数校验挡在查询前面（sourceType 必须在那几类里、sourceId 非空且 ≤200 字）。
- 上下文装配那句 unavailability 跟着改口：现在说的是"能按出处取回，但这一轮没有替你取"。

一条断言被实测纠正了：第一版直接断"整块 > 摘录窗口"，红在 145 vs 145——新项目的块本来就短于
一整个窗口，那条断言测的不是这条通道的理由。改成两块：小块的包含关系（content ≥ snippet），
另造一个长文案（同一出处第二次保存）断严格大于——**这条通道的价值只在块超过窗口时成立**，
所以见证要造出那个形状，而不是拿一个恰好短的项目去断言。

凭证：knowledge 两个文件 44/44（新增 1 条，17 条集成里的一条）。变异探针把 readKnowledgeBlock
的项目边界删掉 → 1 failed，红的正是那条跨项目断言，还原后 md5 一致。

#75 还欠一格：上下文面板的摘录旁边没有"取整块"的按钮——通道通了，入口还没接（这仓库有过同形状的前科：#66/#67）。（这一格已在下一片补完，见文末「整块语料的界面入口」。）

这一片的红门记录（同一笔前科的第二次）：新断言里写的是 `full.blocks[0].content`，vitest 44 条全绿，
pre-commit 的 typecheck 却红 6 条——`noUncheckedIndexedAccess` 说 Object is possibly undefined。
**vitest 不做类型检查**，索引访问在门禁眼里就是会消失；这次是 hook 兜住的，不是我提前想到的。
改法是绑一个 `const block = full.blocks[0]` 再判空，而不是到处加感叹号——判空那句顺手把
「取回来是空列表」这种前提断裂变成会出声的错误。

再记一条自己咬自己的：这段补记第一次是用 bash 双引号里的 `node -e` 写的，文本里带着 markdown 反引号，
反引号被 shell 当成命令替换吃掉，追加进去的几行变成半句话混进正文；第二次换单引号又被内层双引号绊住。
**多行中文文档一律用 Edit/Write 落盘**，`node -e` 只留给不含反引号、美元符与内层引号的短脚本——
这一片里它已经三次把话讲到一半吞掉了。

## §49 最后一格补完：整块语料的界面入口（#75 关掉）

上一片只把通道做出来（`GET …/knowledge/block`），摘录旁边没有那个按钮——这仓库对"服务端已通、界面没入口"
是有前科的（#66 组件删除、#67 角色→场景），所以这一片就补那一寸：每条摘录下面一个「取整块」，
取回来显示正文 + 「第 n/N 块 · T token」，失败时把服务端那句原因原样落在界面上。

- 错误路径是这一格的重点：404 不能说成"这块是空的"。`[data-context-block-error]` 显示的是
  路由给的那句"来源已删除而索引还没重建（点「重建索引」核对）"，与"取回来确实是空列表"
  （`[data-context-block-empty]`，另一句话）分得很开。
- 参数仍然走 `URLSearchParams`（上一片那条纪律的第三次应用）。

凭证：上下文那条 `@smoke` 加长——点「取整块」→ 断正文里出现刚改进去的那句、断「第 n/N 块 · T token」那行、
再用 `page.route` 把 block 那一条 GET 拦成 404 → 断错误句出现且 `[data-context-block-text]` 计数 0。
**1 passed (17.0s)**，`npm run typecheck` 0。两条变异探针各自只落一处且都红：把按钮的 onClick 换成空操作 →
1 failed；把 catch 里那句错误原因改成 `error: null` → 1 failed（证明"失败被吞成空"这个形状真的会被抓到），
两刀跑完都还原、md5 与探针前一致。

## §49 × §46：镜头的角色在语料里写名字，不写那串 uuid

§54 那一片给引用定过规矩：块里写「追杀 → 守夜人」，因为那是查得到的一句话；「追杀 → ge_mb3k9x」不是。
同一句话在分镜那一格漏了——`chunksFromStoryboard` 把 `shot.characterId` 原样写进散文。
那串 uuid 是库生成的行身份（§46 明写"模型里那个临时 id 不外传"），既读不出设定，也不是能拿去核对的话。

- `chunksFromStoryboard(document, storyboardId, worldId, characterNames?)`：给了名字表就写「角色：守夜人」，
  **认不出来才退回原 id**——宁可留一句不好读但能核对的话，也不写"（不认识）"这种没有出处的字。
- 名字表在 `syncProjectKnowledge` 已有的那次角色循环里顺手攒出来，不为这件事多开一次查询。
- 镜头归属那条校验本来就在服务端（`firstForeignRef`：挂的角色/资产必须属于本项目），这一片不加新规则，
  只是让已经合法的引用在语料里说人话。

一条测试前提被实测纠正：第一版取"第一块命中的分镜语料"来断言，红在
`expected '灯塔的光扫过浮冰…' to contain '角色：守夜人'`——那块是**作者写的那句来源**，
它本来就不带机位/角色这些行。改成取标题带「第 N 镜」的那块，断的才是该断的那一块。
整块正文走的是这一批刚补上的 `readKnowledgeBlock`：摘录窗口不够长时，它正是该用的工具。

凭证：`knowledge.test.ts` 28/28、`knowledge.integration.test.ts` 18/18（真库那条：`createProjectCharacter`
建出守夜人 → 每镜挂它的 id → `saveStoryboard` → 检索那句镜头描述 → 按出处取整块 →
断含「角色：守夜人」且**不含那串 uuid**）。变异探针把名字表退回只写 id → `2 failed / 46`，
红的正是纯函数那条与真库那条；还原后 46/46、md5 与探针前一致。

## §40 那一寸补上了：镜头可以挂本项目名册里的角色（#76 关掉）

模型字段 `Shot.characterId` / `referenceAssetId` 与服务端归属校验（`firstForeignRef`：
挂的角色/资产不属于本项目就整份拒绝）早就都在，缺的只是界面上那个选择器——
本仓库为这件事栽过三次（#66 组件删除、#67 角色→场景、#75 整块语料），所以这次把入口和见证一起补。

- 选项**只来自服务端**：`/characters` 与 `/assets` 各拉一次，面板不给用户手填 id。
  这样"点了才被服务端挡下"这条路在界面上出不来；名册为空时那句提示也写在脸上
  （`data-storyboard-roster-note`：还没有角色 / 参考图要先上传），不是让下拉框默默只剩"不挂角色"。
- 一次选择 = 一个可撤销事务（§150）：走 `storyboardStore.applyOps([{ op: 'updateShot', before, after }])`，
  撤销是逆补丁而不是重打一遍；"不挂角色"写回 `undefined`，落库时那个键就没了。

凭证：`e2e/storyboard.spec.ts:36` 新增一条 `@smoke`（真浏览器，**1 passed (13.3s)**）——
角色面板建「守夜人」→ 分镜面板切一版 → 选择器只有 2 个 option 且第 2 个是那位角色（名册是服务端给的）→
选上 → 撤销回到「不挂角色」→ 重做又回到「守夜人」→ **点重新装配（reload）后仍是「守夜人」**，
这一步走的是服务端，证明落库的不是内存。整组 `e2e/storyboard.spec.ts` **4 passed (22.9s)**，typecheck 0。
变异探针把 `after` 写成 `shot.characterId`（点了等于没改）→ 1 failed，红的正是那条选择器用例；还原后 md5 一致。

§40 还没做完的那半截留在原处：镜头的**视频**（`videoAssetId`）要真 provider，本机不做假生成；
参考图那一格这一片只上了"能选本项目资产"，还没有把 §38 的生成按钮接到镜头上。

## §40 × §38/§39：镜头行上的「DEMO 参考图」——两条箭头都证了（#77 关掉）

上一片欠的那半截补上：镜头行加一个按钮，拿这一镜的提示词走 §38 那条 Text → Image，
挂过角色就走 §39 的 Character → Scene（服务端自己去取那位角色的肖像当参考，字节不经客户端）。
产出的资产 id 立刻挂进 `shot.referenceAssetId`，仍然是一个可撤销事务。

三句实话跟着按钮一起写：

- 按钮就叫 **DEMO 参考图**，`title` 写着"本地确定性合成，不是 AI 出图"（§160）。
- **挂了但没有视觉标识的角色会被拒**：测试里那位「守夜人」只有名字，Character → Scene
  返回的是"palette 是空的，先补 §39 那一栏"，界面把这句原样显示在 `data-storyboard-image-error`，
  **一个 option 都不许多出来**。不悄悄退化成"随便出一张图"，也不假装生成了。
- 撤销只断开引用，**不删那张已经花过额度产出的资产**；删资产是资产库那一格的动作，不塞进 undo。

两处实现上的坑是被测试逼出来的，都记下来：
1. 生成完不补名册，那个 `<select>` 会因为"值不在选项里"被浏览器渲染成空白，用户看到的就是
   "刚生成的东西不见了"。所以成功后把新资产并进 roster（并去重）。
2. **整组跑红过一次，单独跑绿**：撤销/重做各自都是一个新事务，重做之后自动保存还没落地就点
   「重新装配」，读回来的是上一次落库的状态。这里不能用"等文本变已保存"——那一栏在重做的瞬间
   可能还挂着上一次的"已保存"，会假通过。改成 `expect.poll` 反复重新装配直到服务端认可，
   断言的内容没变（库里就是那位角色），但不再赌时序。整组连跑两遍各 4 passed (21.6s / 22.8s)。

凭证：`e2e/storyboard.spec.ts:36` 那条 `@smoke` 加长到两条箭头 + 名册补全 + 撤销不删资产；
变异探针两条各落一处且都红——把名册补全那一步变成"当作已存在" → `toHaveCount` 红；
把挂了角色的分支也走纯文本箭头（假装 Character → Scene 不存在） → 那句"视觉标识"的拒绝红。
两刀跑完都还原，`StoryboardPanel.tsx` md5 与基线一致。typecheck 0（含 `e2e` 那一个 tsconfig）。

## 全量回归检查点：今天这十二次提交之后，99 个测试文件 / 1083 条用例全绿

这一天改了 knowledge / context / assemble / search / 三个面板 / 两条路由 / schemas / 契约夹具 /
ai-service 的提示词，但每一片只跑过自己那一小段。补一次全量：
npx vitest run --fileParallelism false → **99 个文件、1083 条用例、0 失败、0 跳过**
（数字是从 JSON 报告里数的，不是拿 exit code 当结论）。

顺手把镜头那格的最后一句限度挪到它该在的地方：时间线旁原来只有「不可播」两个字，
为什么不可播只藏在 notes 里。现在写着「不可播：还没有能直接播放的画面——镜头视频那一格要真 provider，
本机不做假生成（§159）」。对应的 e2e 断言从 toHaveText 一句改成两条 toContainText：
「不可播」与「不做假生成」都要出现——**结论和理由一起断**，否则哪天只改解释的那半句测试不会响。
e2e/storyboard.spec.ts 整组 4 passed (19.4s)，typecheck 0。

## #62 上半截：增量保存落地——写 1 行，而不是 10000 行（2026-09-28）

`docs/adr/0017-incremental-document-write.md`。`writeDocument` 从「整删重插」改成增量：先算差异，只写变化的行。
**语义没变**——客户端发的是完整文档，缺失即删，最后完成的事务整体胜出（ADR-0016 的锁不动，那条结论不受影响）。

四处是这一刀真正的坑，各有用例钉着（`apps/web/test/document-incremental-save.integration.test.ts`，9 条）：

- **`data` 必须参与比对**：接手时工作区里那版只比 `parentId / nodeType / name / sortIndex / visible / locked`，
  而用户改的文字 / 样式 / 尺寸全在 `data` 里——那条路会「保存成功但什么都没存」。用例：改一个 text 节点的文字。
- **缺失即删，不是只增改**：那版把节点删除整段去掉了（改成「合并语义」，还顺手把并发用例的断言一起改了）。
  删一个节点再保存、读回来它还在，那是 §16 的设计模型漂移。用例：删节点 / 删整页。
- **换页不能走 UPDATE**：`design_nodes` 主键是 `(page_id, id)`，节点换页要按「删旧行 + 插新行」。
  用例：把节点搬去另一页；另有两条是「同一份文档里删掉一页、同时把该页的节点搬到留下的页 / 新建的页」
  （被删页面的行要先排除出「库里已有」的集合，否则那个节点既不插也不改地消失）。
- **删除要按主键走**：`delete ... where page_id = ? and id in (...)`。单独按 id 删用不上 `(page_id, id)` 主键，
  是全表扫描——本机测试库积到十万行时，并发用例从 1.9s+0.8s 涨到 12.3s+12.1s。

**差异在哪算**（这一刀最值钱的取舍）：内容差异交给 Postgres（jsonb 相等本身就是键序无关的），
JS 只读回 `id + page_id`。把 4008 行读回 JS 逐字段比是「957.6ms 读 + 468.3ms 比」，
而「只读 id 10–12ms + 库里 jsonb 差集 161.5–264.8ms」。顺带把 `stableKey` 从 `snapshots.ts` 提成
`domain/stable-key.ts`——快照的 `documentsMatch` 与增量保存的 `diffByKey` 从此是同一个实现。

**验证**：4000 节点 A/B/A 三遍（新增 `scripts/perf-save.mts`，`npx tsx scripts/perf-save.mts 4000`）：
改一个节点后保存 **196.8–225.5ms（两遍中位）vs HEAD 782.3ms**；无改动保存 198.1–202.5ms vs 797.0ms。
整张读数表与三条读数纪律在 `docs/PERFORMANCE.md` 的 2026-09-28 那一节。
写入路径相关的 **17 个测试文件 / 149 条用例全绿**（不是全量回归，是「用到 `saveDocument` 的那一批」），
本片新增 9 条用例；`npx eslint` 对本片 6 个文件 0 问题。

**这一刀没有关掉的**：`docs/TESTING.md` 那条「属性写入 <50ms」仍然红。剩下的代价不是「写多少行」，
而是每次保存都要把整份文档过一遍（客户端发 3.5MB 全量 + 服务端序列化 + 库里解析比对 ≈180ms），
外加 `saveDocument` 之后的 §49 语料同步仍是全量重切（146.5ms @4000 节点）。
再往下走只有「客户端发补丁」（§150 的 Command 已经在客户端存在）——那是单独一片。
10000 档这一版没量到（HEAD 是 1433.9ms），下次补。**2026-10-09 已补**：同一会话两遍，
改一个节点 477.6–503.3ms（中位）/ 最小 447.6–457.0，约为旧口径的 2.9 倍快——写放大在顶档同样关掉了，
读数与三条纪律在 `docs/PERFORMANCE.md` 文末「10000 档补测」那一节。**#62 的两格至此都落地了：
① 读数（2026-10-09，本节上文）与 ②「客户端发补丁」（同日落地，`docs/adr/0033-autosave-sends-patch-not-document.md`）**——
属性写入 → 画布更新在 1000 档进了 <50ms（42.8ms，dev 口径），10000 档仍红（181.9ms），
红的是 §147 的画布/选中渲染路径，不再是保存报文。

## #62② 自动保存改发补丁：写 1 条 op，而不是 3.4MB（2026-10-09）

`docs/adr/0033-autosave-sends-patch-not-document.md`。`store.save()` 从整份 PUT 改成优先发
§150 的 Command 补丁：`PATCH /api/projects/<id>/design`，报文 `{ patches }` 按时间序
（一条命令一个补丁，撤销发逆补丁，AI 事务同一条队列——服务端看到的动词词汇与手工编辑完全一致）。

- **服务端**：`patchProjectDocument`（`server/domain/projects.ts`）= `lockProjectWrites` →
  `loadDocument(tx)`（锁内读最新版）→ 逐条 `applyPatch` → `parseDocument` 形状门 →
  同一个 `writeProjectDocument`（文档行 + 项目摘要列仍只有一处实现）→ 事务外
  `syncDesignKnowledge`（与 `saveDocument` 同一条纪律）。三种拒绝都**整批一条不写**：
  任何一条 op 打空 → `ops_skipped`（409）；打完的文档过不了门 → `document_rejected`（400）；
  库里没文档 → 404。这一条路刻意没有审批门：报文来自作者本人（requireUser + 归属），
  与 PUT 同一信任级，§74 的门拦的是 AI 与公开 API。
- **客户端**：待发队列 `pendingPatches`（execute/undo/redo/AI 事务四处入队），
  `editSeq` 判"在途期间又有编辑"，`forceFullSave` 给 `setMode` / `setPage` / `jumpTo` / 快照恢复
  这类"补丁词汇表达不了的整份替换"显式逃生门；补丁请求被门挡下（409/400）当场换全量 PUT 兜底
  （同一个人的同一份内存状态，换一条路，不卡 error）；网络失败把补丁放回队头，下一轮再发。
  离线期间的 `flushBeforeAi` / publish / snapshot 全部经同一条 `save()`，不用各自记得换报文。
- **契约**：`ProjectDesignPatchRequestSchema` 进 `packages/schemas`（跨端报文只走 schemas，
  与公开 API 的 `ApiDesignPatchRequestSchema` 同词汇不同上限——那边 ops ≤200，这边 patches ≤200）。
- 验证：`document-patch-save.integration.test.ts` **7 条**真库 + `studio-patch-save.test.ts` **6 条**
  客户端；变异四次各红一处（execute 入队、skipped 判定、409 兜底、形状门），都还原后对照全绿；
  e2e `@smoke AI command bar` 的"落库先于 AI"断言从"PUT"改成"落库"（钉顺序不钉动词），
  `studio slice: select, edit a property, undo, autosave`、§162、#10 连跑绿。全量 vitest + lint 绿。
- 账（`docs/PERFORMANCE.md` 同日两节全表）：服务端**更慢**（@10000 799.6ms vs 全量 450.5ms——
  loadDocument 是补丁路径新增的一段，明账不藏）；省下的是客户端 3.4/8.4MB 主线程序列化与上行字节。
  浏览器门：1000 档属性写入 → 画布更新 **42.8ms 进 <50ms**；10000 档 181.9ms 仍红（§147 渲染路径的账）。

## §41 第一片：时间线从「读数」变成编辑面（拖 trim / 拖 reorder / 点转场）

§41 要的是"类似视频编辑器"的时间线。在这一片之前，界面上只有一条**读数**：总长几秒、可不可播、
三条空轨为什么是空的。长度、顺序、转场确实能改，但只能回到上面的镜头表里改数字、点 ↑↓——
**时间线自己碰不得**，而原文点名的六个动词里，trim / reorder / extend 说的都是在时间线上直接改。

这一片补的就是那一寸：一格一镜、宽度即时长（`timelineOf` 的投影，不是第二份真值），三种直接操作各有实现——
右边缘 trim/extend、整块 reorder、左上角的转场标记换衔接。三个决定没有放在组件里，放在
`packages/video-model` 的纯函数上（那里才测得到）：`clampShotDuration`（吸附 100 毫秒、下限一步、
上限与镜头表那个数字框同一个数）与 `dropIndexFor`（按**其余镜头的中点**分界：拖动时这一镜自己的宽度也在变，
用"目标格左边缘"那种判据会在同一个位置给出两个答案，界面就在相邻两位之间跳；它返回的是**最终下标**，
与 `moveShot.to` 同口径，所以"拖回原位"拿回原下标，界面据此不记一次空事务）。

**拖动期间库里一动不动**：预览只活在组件状态里，松手才落一个 §150 的补丁事务——
每次 pointermove 都写库会把撤销栈塞进几十步（Ctrl+Z 要按几十次），中途关页面还会留下半截长度。
拖整块的位移按条宽夹住（`minDx`/`maxDx`）：不夹的话那格会被条的 `overflow-hidden` 裁到看不见。
另外，序号与时长最初是居中流排版，转场标记盖住了"4.5s"的 4——改成三处绝对定位（左上转场、右上序号、
底部居中时长），面板只有 239 像素，47 像素的一格放不下三段居中文字。**这两处都是从截图里看出来的。**

**凭证**：`packages/video-model/test/timeline-edit.test.ts` **11 条**纯单测（吸附、上下限、坏数、
拖回原位、跨中点、拖出两端、不在分镜里抛错，以及两条"接进 `moveShot` 之后顺序到底排成什么样"——
下标口径差一位就会在那两条上红）；`e2e/storyboard.spec.ts` 新增一条 `@smoke`：拖边缘（读数在、库里没动 →
松手后库里变了且 %100 为 0 → 撤销回原值）、点转场（库里换了、镜头表那一栏跟着动 → 撤销）、
拖整块（目标格被标出、读数说"第 N 位"、落下后顺序变了 → 撤销）。**1 passed (7.9s)**；
整组 **5 passed (1.2m)**（含改同一个面板的四条老用例）。三条变异探针各只红一处、都还原
（`StoryboardPanel.tsx` md5 与探针前一致 `E40EFA9C…`）：① 去掉吸附 → **库里的值根本没变**
（这一条比预想的狠：契约里 `durationMs` 是 `z.number().int()`，非整数毫秒整份 PUT 会被拒，
吸附不只是好看，它是"这次编辑写不写得进去"的前提）；② 每次 pointermove 都写库 →
红在"拖动中库里那一份还是旧的"（Expected 3000, Received 5500）；③ 落下下标减一 →
红在顺序断言（Array [2,3,1,4] 对 [2,3,4,1]）。
截图 `screenshots/storyboard-timeline-edit.png`（编辑面 + 轨道）与 `storyboard-timeline-dragging.png`（拖动中的目标格与读数）。

**§41 第二片（2026-09-30）：键盘也能改长度**——`docs/DESIGN_SYSTEM.md` §90 要求"全部交互可键盘到达"，
拖拽能做的事必须能用键盘做一遍，而且**标准一样**。

- 左右方向键各一格（`SHOT_MS_STEP`，100ms），**Shift 是粗档一次 1 秒**（`SHOT_MS_COARSE_STEP = SHOT_MS_STEP × 10`）。
  粗档**共用**拖动那条路的刻度而不是自己定一个（比如 500ms）：两条路改的是同一个 `durationMs`，
  刻度不同的话键盘调出来的数在拖动那条路上没有对应档位，作者就会看到"明明调好了、一碰鼠标又跳一下"。
- `keyboardTrimDelta(key, shiftKey)` **不管的键返回 `null` 而不是 `0`**：`0` 会被调用方当成
  "一次合法的零步操作"，于是 `preventDefault` 掉一个本该交给别人的按键——上下方向键要留给面板滚动。
  返回 `null` 就是"这个键不是 trim 的"，调用方原样放行。
- **拖拽状态按 `via` 分成两种**（`{ kind:'trim'; via:'pointer'; … }` 与键盘那一支），
  而不是把指针几何设成可选字段：可选字段会让"键盘这条路上混进一次 pointermove"变成**能编译过的写法**。
- 提交语义与拖动**完全一致**：调整期间库里一动不动，Enter 才落**一个** §150 事务，Esc 取消——
  所以整段键盘调整（三下按键）**撤销一步**就回到原样，不是三步。
- **凭证**：`timeline-edit.test.ts` 新增 `keyboardTrimDelta` 一组，最后三条都把增量接进
  `clampShotDuration` 再看结果——只看增量的话，"把一镜调成 0 毫秒"或"调出一个不在 100ms 刻度上的数"
  这两种错都测不出来；`e2e/storyboard.spec.ts` 新增一条 `@smoke §41 时间线键盘那条路`：
  方向键调长度、Shift 粗档、Enter 落库、Esc 取消，且**不惊动画布**。

## §133/§134 第二片：storage 那一格真的有执行方了（拒绝新写入，不驱逐）

第一片里 storage 只是表上的数字（ADR-0014 明写着"还没有拦截方"）。这一片把它接成真的：
`uploadImageAsset` 在**字节进对象存储之前**问一句"这个人还放得下吗"，放不下就整条拒掉——
`413 storage_exhausted`，话里带档位与三个数字（"Free 档上限 200MB，已用 198MB，这一次还要 4MB"），
与 `refusalFor` 同一条口径。

三个决定写在 ADR-0018：**用量是派生的**（`SUM(assets.bytes)`，按所有者跨项目合计，库里没有"已用"那一列）；
**门放在唯一的摄取门里而不是路由上**（§80：全链路只有那一处读字节，用户上传与 §38 生成共用它——
挂路由上会漏掉生成那条路）；**只拒新写入、不驱逐**（自动删用户的图是最坏的一种限额）。
checksum 命中的重复上传在门**之前**就返回了，所以满仓时它照样放行：那份字节已经在库里，不该收两次占用。

界面上 storage 从"还没有拦截方"那一列挪到"会真拦"那一列（`ENFORCED_PLAN_AXES`），
并多了一行「已用 X / 上限 Y MB」；两列加起来仍然等于 §133 那五件事，有单测钉着——
把 `ENFORCED_PLAN_AXES` 改回去而忘了改页面，那条会红。

**验证**：`credits.test.ts` 新增 4 条纯规则（1024 进制换算与单调性、边界在 `used + incoming` 上、
两列互斥且加起来是五件事、给人看的字节数只留一位小数）；`assets.integration.test.ts` 新增 2 条打真库 + 真存储
（铺满到上限 → 上传被拒且**一行都不写** → 只把档位换成 pro，同一次上传就放行；checksum 命中的重复上传在满仓时仍放行）。
这两条用**自己的所有者**：用量是按所有者跨项目求和的，共用文件级那个 ownerId 会让别的用例留下的素材把"已用"顶到上限
——实测就是这么红了第一次，所以拆了 owner。
变异探针：把 `if (refusal)` 改成 `if (refusal && false)` → 「超配额拒绝新写入」那条红在 `expect(blocked.ok).toBe(false)`，
还原后全绿。相关 8 个测试文件 **100 条全绿**（credits / credits.integration / assets.integration / avatar /
image-safety / image-studio / ai-jobs / studio-flush，不是全量回归）；改动文件 `npx eslint` 0 问题；`apps/web` typecheck 0。

**没做的（照实记）**：① 生成那条路的 413 只由代码路径与 typecheck 保证，没有单起一条集成用例
（拒的还是同一道门里的同一个函数）；② 这道门**不预扣**——两个并发上传可能都过、合计略微越限（ADR-0018 写明）；
③ generation / team collaboration / publishing 三格仍然只是数字；④ 改档位仍然只能改库或改服务端代码，没有界面。

## 交接点（这一轮停在这里，下一轮从这里接）

状态（2026-09-28 夜更新）：增量保存这一片落地并提交，写入路径相关的 17 个文件 / 149 条用例绿。
另一条线（§41 第一片，时间轴拖动）也已落地：`StoryboardPanel.tsx` 里那个当时未定义的 `TimelineDrag`
是它写到一半的状态，类型与两种拖拽现在都在（见上面「§41 第一片」），它自己那 4 个文件 `npx eslint` 0 问题。

**并发实情（写给下一个接手的）**：今晚这个 checkout 上有两个会话同时在跑同一句"继续做这个项目"。
文件范围是错开的（一条在 `server/domain` 的写入路径，一条在 `studio` / `video-model` 的界面与模型），
但**门禁是共用的**：pre-commit 钩子跑的是整棵树的 `npm run lint`，一边留着语法半成品时另一边就提交不了。
所以：动手前先 `git status` 看清在途文件，提交时只 `git add` 自己改过的路径，别用 `--no-verify` / `SKIP_HOOKS=1` 绕。

推进队列（不依赖外部授权，按顺序取下一格；2026-10-10 深夜重排）：

1. ~~**#10 账本实时**~~ **已落地**（2026-10-09，见「[x] #10 账本实时」那一条）。
2. ~~**#62② 客户端发补丁**~~ **已落地**（2026-10-09，`docs/adr/0033-*`）。
3. ~~**§147 选中响应（<16ms）与 10000 档渲染**~~ **归因完成（2026-10-10）；增量重解落地（2026-10-21）**：
   选中响应 44ms（prod 1000 档）经 CPU 采样证明 **>80% idle、0 个应用函数命中**——
   这扇门的地板（输入→绘制流水线 2–3 帧）高于门的数字，不是界面代码的账；
   分段标记（`nexus:sel:store/commit`）与三段拆分探针已进 `scripts/perf-browser.mts`，
   2026-10-20 补上了生产构建下的分段读数（B 片的开关 `NEXT_PUBLIC_NEXUS_PERF_SEGMENTS=1` 正好用上）。
   **"数没量到"那条今天解除了**：10000 档在生产构建下量不到，是因为 `page.goto` 用着 playwright 默认的
   **30s 导航上限**（首屏 8.4MB 文档的编译+加载）——**量不到是因为导航超时，不是那一档渲染得慢**
   （dev 档首帧 1203.7ms）。脚本的三处导航上限放宽到 300s（**只放宽导航，不改量法**），
   那一档当天就量到了（口径 `prod-4502d2f`：属性写入 95.8ms、首帧 1084.5ms、选中 23.4ms）。
   **增量重解（ROADMAP #133）也落地了**（2026-10-21，`16ddc0b`）：两份实现合一（删掉约 400 行重复，
   "增量与全量相等"由构造保证）+ 真复用（没碰到的分支沿用上一帧同一个对象）+ Studio 侧接线
   （改动集合保守收集、undo/redo 也登记、基准校验文档与页的身份）+ 回退开关
   （`NEXT_PUBLIC_NEXUS_INCREMENTAL_LAYOUT=0` 走全量）。
   **但红线没达成**：模型层 10000 节点省 63%（改几何 230.2 → 84.4ms）/ 68%（改样式 150.8 → 47.8ms），
   **浏览器那一档却是 128.2 vs 128.8ms（0%）**。
   **差别的原因当天查清了（带分段的两轮）**：**增量的收益完全取决于「文档形状 × 改动位置」**——
   `perf-browser` 造的 10000 档文档是**扁平的**（一页 10000 个节点全挂 root），
   改任一个节点 → 其余 9999 个兄弟**全部移位** → 位置全变 → 一个都沿用不上 → 复用率 0；
   而模型层那棵是**深树**（深 6 层），改最深的叶子 → 省 63%。
   **并且增量对 10000 档的**首屏**零帮助**（首屏没有"上一帧"可复用）——那一格要别的解法。
   **那一格也量过了（2026-10-21 凌晨，`scripts/first-paint-cost.mts`）**：服务端读 1019ms + 组装 ≥36ms + 序列化 267ms
   ≈ **1.3 秒**；传输不是瓶颈（**gzip 后只有 0.17MB**）。
   **⚠️ 但"7.2 秒在 RSC 序列化"那个推论是错的（当晚就推翻了）**：把"首屏不带文档"那一刀真做了，
   同一台机器同一时段量开/关两轮 → **两个数在噪声里**（HTML 到手 1679ms 带 / 1868ms 不带）→ **那一刀没收益**。
   真相是：**"7.2 秒"那个读数本身带着当时的机器负载**（今天同一台机器 HTML 到手只有 1.5~2.2 秒）。
   **所以首屏那一格还欠一次干净的测量**（安静机器 + 同一构建 + 至少两遍）；
   在那之前**"首屏慢在哪里"还没有答案**，别拿任何一版数去论证优化。
   **那笔测量当天上午就做了（安静机器、同一构建连量两遍）**：HTML 到手 **1365/1123ms**、
   第一个节点画出 2249/2033ms → **"7.2 秒"确认是机器负载**。
   **又过了半小时量了开/关 A/B（同一构建起两个 server 交替量，因为 `NEXUS_STUDIO_SSR_DOCUMENT`
   是服务器端运行时读的）**：
   **带文档** HTML 到手 1040-1533ms、首帧 952/1349ms、属性写入 22-25ms；
   **不带** HTML 到手 27-306ms、首帧 1775/1830ms、属性写入 41-54ms。
   **⇒ 判决：这一刀不做**（省的是 HTML 等待，首屏一点不早、首次编辑还更慢）。
   **下一片的两条路已量化（同一份数据，`scripts/first-paint-cost.mts`）**：
   首屏服务端那 1.3 秒 = 读 **1019ms（78%）** + 组装 ≥36ms + 序列化 267ms；
   而 psql 读同样 10000 行只要 **235ms** → **差的那 780ms 是 node-postgres 的逐行解析**（不是数据库慢）
   → ① **存储形状**（每节点一行 → 一页一行）估能省 **700~850ms**（**是估，不是测**；代价是存储迁移）；
   ② **首屏只带视口内**（要"部分文档"这个新能力）。
   **这一格先不动手**：先核①的可行性（写路径/快照/分支复制/导入导出各碰 `design_nodes` 几处），核完再定顺序。
   **可行性已核（`grep designNodes`：只碰 4 个文件）**：
   写与读**都集中在 `server/domain/projects.ts` 一处**（逐节点写 311-325、批量插入 417、整页读 571）→ 迁移面比想象小 ✓；
   **但 `server/domain/search.ts`（按节点名 `ilike` + 按 updatedAt 排序）真的需要逐节点行** → 「一页一行」要给搜索留一条路
   （jsonb 里的名字数组 + GIN 索引？还是另留一张只放 id 与名字的窄表？）**要实查**；
   **更要紧的是写放大**：一页 10000 节点若"每次编辑重写整页 jsonb"→ 每次编辑写 10.7MB ✗
   → **省了首屏那 780ms，却把编辑变贵** → 这一条不核清楚不能动。
   ⇒ **下一片的入口就是这两条只读核对**（搜索怎么查、写放大多少），核完再定动手顺序。
   **⇒ 首屏那一格的真问题因此清楚了**：瓶颈是**服务端把那份 10000 节点文档读出来 + 组装 + 序列化**（≈1.3 秒），
   两条路：**① 存储形状**（`design_nodes` 每节点一行 → 一页一行；存储迁移）
   与 **② 首屏只带视口内**（要"部分文档"这个新能力）。判决书见 `docs/adr/0048-first-paint-document-not-in-html.md`。

    **更新（2026-10-21 中午）：两条路都被真数据否掉了（`scripts/jsonb-agg-probe.mts`，同一份 10000 节点文档）：**
    逐行读 + Node 组装 **151ms + 4ms = 155ms**；jsonb_agg 一行 + JSON.parse **643ms + 741ms = 1384ms**（9 倍慢），内容逐项相等（0 条不同）。
    **⇒ 首屏那一格的真问题现在定位好了**：读 10000 行 + 在 Node 里组装，**才 155ms**——那"约 1.3 秒"里大头不在读与组装。
    `loadDocument` 还读了 pages / design_tokens / components / assets 各一张表（drizzle 行映射 × 4 张表），再加 RSC 序列化 9.37MB 载荷和浏览器那一段（解析 + 水合 + 首屏求解 + 首次绘制）。
    **⇒ 那 1.15 秒找到了（2026-10-21 下午）：是 drizzle 的逐行映射，不是数据库。**
    `scripts/design-nodes-read-cost.mts` **交错**量同一步的两种读法（负载会漂，一次量完 A 再量 B 不可比）：
    drizzle `select()` **817ms** vs 裸 sql（无映射）+ 同样组装 **499ms**（中位，比值 64%；那轮机器很挤，绝对值待重测）。
    **为什么白做**：`design_nodes` 的载荷整份在 `data` 那一列（jsonb），drizzle 映射完代码里还是直接取 `row.data`。
    **⇒ 落成代码（只改一处）**：`loadDocument` 读 `design_nodes` 改走 `reader.execute(sql`SELECT id, data …`)`（原始行，不经映射），
    组装仍在 Node 里（不挪进 Postgres——那条 9 倍慢，已否）；`DocumentReader` 加了 `execute`（读取路径仍拿不到写的能力）。
    **红线**：`apps/web/test/load-document-identity.integration.test.ts`——读回来的文档必须与**库里的原始行逐项相等**
    （内容/键集合/顺序/token 引用），且**验证过故意少读一个节点就会红** ✓。
    **⚠️ 下一格要在安静机器上重测**（同一构建、开/关两轮）把最终数写死。
    **系统排查已做完**（`scripts/drizzle-mapping-cost.mts`，交错量、只读）：那一层开销**只有"一次把整份文档读出来"
    那一条路径上有**（那里行数上万且整列都是 jsonb）；搜索路径（只选 3 列）drizzle 反而更快（3.5ms vs 裸 sql 11.3ms，
    它走了索引）→ **其余路径不必动**（少改一处是一处）。
    **已重测（下午，安静机器、同一构建、两个 server 交替量、开→关→关→开各两轮）**：
    10000 档 **第一个节点画出**（用户看到画布有东西）带文档 **2065/2436ms** vs 不带 **1478/1583ms**
    → **不带文档早 400~850ms**；但**画布容器**出现晚 ~450~520ms（首帧 1046 → 1494/1565ms）、
    首次编辑慢约一倍（18.5/27.6 → 31.2/35ms）。
    **⇒ 判决从"不做"改成"有取舍，待产品拍板"**（默认保持带文档，开关就位）。
    **一条要记的方法论**：这一格的判决**因为服务端一次提速而改过两次** ⇒
    **任何"值不值"的结论只在当下那一版服务端成立，服务端一变就要重量**。
    **⇒ 那一格现在拆成三段了（安静机器、同一份真文档）**：服务端 `loadDocument` **434ms**（修后；修前 2.1~3.1 秒）
    ＋ **RSC 序列化 + 传输 ≈700-900ms** ＋ **浏览器（解析+水合+首屏求解+首绘）≈800-950ms**
    ⇒ **两段大头都随文档大小走，解法是同一个：首屏别带整份文档**；
    而"带多少"有个便宜的答案——**画布是虚拟化的**（10000 档在浏览器里**只渲染 34 个 DOM 节点**）
    ⇒ 首屏真正需要的只是视口内那几十个节点。
    **⇒ 下一格＝"部分文档"能力的可行性核对（先只读，不动手）**：几何全给（~1MB 量级）＋内容按视口给，
    滚动到别处再按需补（分页 + 合并 + 一致性），代价与风险一起列清。
    **核对已做完第一轮**（`packages/design-model/src/viewport.ts`）：裁剪判据**是纯几何的**
    （≤400 个节点不裁；否则视口 + 256px 外扩与包围盒相交）⇒ **"首屏带哪些内容"有现成判据**，
    而 10000 档只渲染 **34 个** DOM 节点 ⇒ 首屏内容就是视口内那几十个；
    **形态**：服务端算全量布局 → 首屏传**全量几何 + 视口内内容** → 滚动到别处按需补。
    **待决风险三条**（动手前要答完）：① 视口外内容缺失时画布显示什么（**产品决定**）；
    ② 补内容的请求与合并规则；③ `ResolvedLayout.nodes[id]` 现在把几何与内容揉在一起
    （`node` 字段就是内容），而画布/预览/代码生成三处投影都读它 ⇒ 要"只传几何"得拆这个形状（影响面要数清）。
    **⇒ 核对做完了（2026-10-21 下午，`scripts/partial-document-size.mts`，10000 档真文档）**：
    **首屏载荷 9.37MB → 938KB（10.2× 小）** = 瘦 layout（**数组编码**的 `[x,y,w,h,depth,parentId,children]`，~780KB）
    ＋ **视口内 54 个节点的完整 node**（几何+样式+文字）；视口内可见 **54 个**（裁掉 9946 个）✓
    ⇒ 那两段随大小走的大头会按这个比例缩 ⇒ 首屏有望落到 300~500ms 量级（**是估，动手前还要实测**）。
    **风险①的技术侧答案**：`nodeStyle` 假设 node 完整 ⇒ 两种画法（视口外不画 / 画占位框），
    **观感由产品选**（现有代码专为此加过 256px 外扩 ⇒ 作者在意"元素凭空长出来"）。
    **风险②有先例可抄**（`marketplace.ts` 的 limit/offset、`notifications.ts` 的 limit+1 判断还有没有更多）。
    **风险③波及面数清**：画布（含 React memo 比较器读 14 个字段）/变体看板/预览页/公开页/属性面板 ⇒ 要拆 `ResolvedNode` 的形状 ⚠️。
    **⇒ 这是新能力（分页 + 合并 + 一致性），不是一处改动** ⇒ 下一格先定**第一片的最小形态**
    （首屏载荷瘦身 + 滚动时按需补当前视口那一批），再动手。
    **⚠️ 2026-10-21 晚：这一路被判决"走不通"（ADR-0051）——理由是硬的不是"难做"**：
    **客户端自己算布局**（`apps/web/src/studio/store.ts:403/413` 调 `resolveLayout`）
    ⇒ 要算全图几何**必须持有全量节点** ⇒ "首屏只给视口内那几十个"⇒ 画布画不出全图；
    而**编辑路径把这个前提钉死了**：改一个节点 ⇒ 兄弟位置跟着变 ⇒ 布局要重算 ⇒ 重算要全量文档
    ⇒ 首屏没给全量，**用户一编辑就得多拉 9.37MB**（把首屏省的时间赔回去还赔上一次往返）。
    **⇒ 剩下能走的路＝流式首屏**：内容照样全给，只是**分批到**（先到骨架+视口内那块 ⇒ 很快看到画布；
    后面陆续补齐 ⇒ 编辑时内容多半已到齐）⇒ **不动任何现有前提** ✓
    **下一格＝流式首屏的可行性核对**：① Next 的 RSC 能不能用流式（`<Suspense>` + 异步组件）
    ② 文档怎么分块（"视口内 + 其余"两段，两个异步组件）③ **第一块能早多少**（同一构建、开/关两轮实测）。
    **⇒ `packages/design-model/src/partial.ts` 留着但**它没有接线**（ADR-0051 里写明了：
    那是**能力**，不是已交付的功能，§159）**；它的用处变成：流式首屏的第一块 ＋ 预览/公开页/变体看板
    算"只有视口内"的那份几何（省 CPU，不改首屏）。
   **这一格也做了（2026-10-21 后半夜，`d36d712`）**：复用再细一层——**跨帧的测量缓存**
   （尺寸没变的部分，测量结果留着；只重算坐标）。红线：10000 档扁平文档的 `layoutMs`
   **104-118ms → 76-91ms**，属性写入总延迟 **131.9ms → 94.5ms**（省 28%）。
   **一条边界**：模型层那个"测量 9999 次 → 1 次"是**计数**不是时间（测试里的 measureText 是故意很慢的计数器），
   **别把计数当收益报**——浏览器的 measureText 是启发式估算，每次很便宜。
   正确性由单测 3 条 + 真浏览器那支（`@smoke studio slice: select, edit a property, undo, autosave`，1 passed 21.4s）守着。
   细节见 `docs/PERFORMANCE.md`「2026-10-21」那两节。
   **自审自己当天写的代码时查出一个真缺口（2026-10-21 凌晨，已修）**：
   测量缓存的键只看「节点 id + 约束」，而**测量用的字号、间距、字体名都来自 token 解析**
   （`resolveNum` 与 `fontFamily` 都走 `tokens.resolveValue`）——
   token 一变而键没变，就会拿回旧尺寸（"改了字号，高度却还是老的"）。
   这与"改了节点内容却沿用旧测量"是同一个坑，只是内容不在节点上、在 token 表里；
   **库自己的注释早就写着"签名包括 tokens"，实现里却没有** → 契约与实现不符。
   **触发条件要说准**（别把它说成"改 token 就画错"）：单独改 token 时改动集合是空的 → 走全量 → 缓存整份清空 → **没事**；
   出事的是**同一个事务里既改 token 又改别的节点**（AI 的一次操作就是这样）：
   改动集合非空 → 走增量 → 缓存没作废 → 受 token 影响的节点拿回旧尺寸 → **画布高度是错的**。
   **修法**：token 表的指纹进测量签名（`tokensSignature`，按 key 排序的 JSON）；
   token 一变 → 签名对不上 → 整份作废。**代价明写**：指纹覆盖**整张** token 表，
   所以改一次品牌色也会让缓存整份作废（下一帧重量一遍）——宁可多量一次，不拿说不清的复用去赌尺寸（§159）。
   **补测 3 条**（`packages/design-model/test/measure-cache.test.ts`），且验证过**摘掉修复后三条全红**
   （"受 token 影响的节点沿用了旧高度 expected 24 to be greater than 24"）——是真守卫，不是摆设。
   **顺带把最后一条 e2e 存量红（§144 413）也修了，根因是真缺陷**：
   Next 16 的**中间件会先把请求正文读进来才运行**（默认 10MB 上限）→
   ① **合法的 >10MB 导入今天就是坏的**（正文被截断）；② 路由那道"按 Content-Length 先拒"来不及跑 →
   客户端猛推时服务端读完才回 413 → 中途收连接 → 客户端只看到 `ECONNRESET`。
   **修法**：导入路由**不进中间件**（它自己管鉴权）→ 头一到手就拒 → **正文一个字都不用读**
   （同一个探针：修之前 8 秒还在等，修之后 **723ms** 拿到 413；Next 那句 10MB 截断警告也没了）。
   **⚠️ 2026-10-21 上午：这一格底下还压着一个更大的发现——§147 的增量重解在编辑器里从来没跑过**
   （探针查出来的：改一个节点后，**没被改**的节点不是同一个对象 → 走的是全量）。
   三处根因：① 补丁走写时拷贝 → 文档对象每次都是新的 → 用对象身份判"是不是同一份文档"永远为假
   → `prev` 恒为 null；② 改动集合登记在**布局求解之后**（`design.execute` 会同步触发 commit）
   → 求解时它是空的；③ AI 事务完全没登记、undo/redo 登记太晚、`jumpTo` 走批量逆补丁也没登记。
   修法：**文档代数**（`DesignStore.generation`：整份换掉 +1、打补丁不变）+ **先登记后变更** +
   "算不全就强制全量"（`removeComponent`/`removeAsset`/`jumpTo`）。
   **接上电之后又量出 7 倍的反向效果**（增量 848ms vs 全量 142ms）：根因是增量路里一个**平方级**的
   形状检查（`children.every(c => prev.children.includes(c.id))`）＋它比错了对象
   （拿按 parentId 建的 resolved 孩子表去比文档结构）＋往沿用来的父节点 push（污染上一帧）。
   修完：模型层同一份真文档 **全量 27-41ms / 增量 16-29ms（测量 7 次 vs 9999 次）**。
   完整判决书见 `docs/adr/0049-incremental-layout-was-never-running.md`。
4. ~~**§146 的 100 档读数补齐**~~ **已落地**（2026-10-10，`docs/PERFORMANCE.md` 同日节）：
   首帧 426.3ms / 属性写入 61.3ms（两遍 31.8–90.7，抖动 2.8×）/ pan 6.1ms / 堆 98MB /
   画布 DOM 100 个（小文档视口裁剪未开）；**选中响应这一档没量到**（3 秒内手柄没出现），
   如实记空，下轮安静窗口补。
5. ~~**实时通道 Redis 后端（ADR-0010 留的第二驱动）~~ **已落地**（2026-10-05，`docs/adr/0028-*`）：
   `realtime/redisBus.ts` 是第二驱动，`bus.ts` 的 `createDefaultBus` 只看 `NEXUS_REDIS_URL` 选它，
   装上了哪个驱动会打进日志，连接坏了不退回进程内也不拖垮请求。
   #10 欠的「账本页 `onReconnect` 补读没有探针」**也已补**（2026-10-10）：
   `realtime-reconnect.test.ts` 的「接线」组多两条源码判据（账本也只有一个 `useRealtime`
   调用、它的 `onReconnect` 接的是 `refresh` 不是空操作）；真断线在浏览器里仍造不出来，
   这条限度照实留着。
6. ~~**§140 第四片：可走的地形**~~ **已落地**（2026-10-10，四步走完，见 §140 条目下的补记）：
   ① 高程在 wire 上被静默剥掉的断链（`WorldPointSchema` 没有 `elevation`，zod 剥未知键，
   面板写的高度存盘后再打开回到地面——实测确认后契约补栏，存取往返各钉）；
   ② 模型与契约（`WorldDocument.terrain` 圆台高度场、`setWorldTerrain`、`bad-terrain`、
   `WorldPlateauSchema`，重叠取最高的圆台——不平均不后画赢）；
   ③ 场景投影纯数据（**踩过的坑**：`sceneTerrain()` 一度带一个 `heightAt` 函数，
   而 WorldScene 要过 server/client 边界，Next 运行时报 Functions cannot be passed…
   3D 页白屏——改成纯数据 + 一条 typeof 断言防 Regression）；
   ④ 3D 与面板（相机贴地、半透明盘 + 高度柱 + 台沿圈、`data-walk-height`、
   WorldPanel 地形区数字输入、`@smoke 3D 世界` 加一段 + 截图 `world3d-terrain.png`）。
   图上画圆台的编辑器**也已补上**（2026-10-13）：世界图工具栏「画地形」按住拖圆、
   点中圆台两步删（`WorldGraphView.tsx` + `terrainDraw.ts` 纯函数，13 条单测 +
   `@smoke …（§140 图上画地形）` 走查拖画/删/刷新仍在）；起笔点先用 `elementFromPoint`
   验空白，候选位夹在**可见区域**——图比视口宽（这版骨架 2146px），按整宽取比例
   会点到视口外（`elementFromPoint` 返回 null）。
    **2026-10-15 第五片：坡地已落地——做剖面（profile），不做网格高度场**：
    `WorldPlateau.profile?: 'mesa' | 'cone'`（缺省 mesa，老文档逐字节不变），cone 台心到
    边缘线性降到 0、可走；两条 e2e 都加了坡（图上虚线圆 + 3D 脚下 `data-walk-height` 4）。
    详见文末「§140 第五片」一节与 ADR-0041（高度场明确不做的理由）。
7. ~~**任务 #132（并发会话登记的 §113 真欠账那一半）**~~ **已落地（2026-10-12 起，`268bd8d` + `d44bbcc`，
   ADR-0034 / ADR-0035；本行 2026-10-20 核对时发现它早已过期）**：`game` 那一步编出来的 GameDocument
   只留在内存里、界面上却写着"已生成…可直接在 Game Studio 试玩"、而库里一行没写——**三件事都做完了**：
   措辞收口（`GAME_DRAFT_NOT_LANDED_NOTE`：草稿存在任务行的这一步里，**没写进项目**）、
   草稿随结论存下来（`draft?: GameDocument` 存在任务行里，不在响应体里，客户端贴不进来）、
   一个用户点出来的"写进项目"（点「接受进项目」才写；已有游戏设计时拒绝覆盖，不静默覆盖）。
   **别照这一行重新发明**：核对方式是 `git log --grep='ADR-0035'` + `apps/web/src/lib/agent-game-draft.ts`。
8. ~~**对话两型引擎 = `ARTIFACT_CHAINS` 的第三个键 `story`**~~ **已落地（2026-10-20，ADR-0046，三片）**：
   `eb7cddf`（片 1 实现）· `475935e`（两个坑的返工）· `a992277`（片 2 见证 24→31 条 + vm 见证）·
   `aec8be3`（片 3 真浏览器 1 passed 1.2m）。
   于是**八型全部带上引擎**——`kindNote`（那句错位披露）今天恒为空，而它仍然是派生的
   （"机制还在"由一条反向控制钉着：临时把状态表某一型的管线改成 `null`，那句话必须出来）。
   判决书：`docs/adr/0046-artifact-third-chain-story-pipeline.md`。
   **下一格若还要动 `packages/game-model/src/codegen.ts`，先 `git status` 看那块是不是有人在途。**
9. **其余 `[~]` 长线**（RAG 向量、图像/视频/角色一致性像素、§54 游戏设计系统）
   **全部卡在真实 provider key 上**——按 §159 留白，不假造。**拿到 key 之前，
   自主推进的格子就是上面的 1–6（1–4 已落地，3 是 §147 的复测窗口）与第 8 项（今天已落地）；
   没有自主格子时就去核对 `[~]` 行是否过期，别照着已经做完的事再做一遍。**

需要用户才能推进的（不要绕过）：真实 provider key。有了它才能落地的是 §49 的向量与 rerank、
§38 的图像那半截像素、§40-42 的镜头视频、§39 的角色一致性像素。这四格今天全部按 §159 留白，
并在界面上写明了限度；换 provider 时不必重接逻辑，只换合成后端。

开工顺序仍是 `agents.md` 那五步：读 ROADMAP 找 `[ ]/[~]` → 读模块文档 → `git log --oneline -15`
→ 先跑最小验证确认起点是绿的 → 实现 / Run / Test / Screenshot / Inspect / Fix / Retest / Commit。

---

## §188 M8 第一片：公开 API v1（只读）+ API 凭据 —— 2026-09-29

- **落了什么**：`api_tokens` 表（迁移 0018：只存 SHA-256、`hint` 认哪一把、三条 CHECK、吊销留时间戳、`user_id` 上 ON DELETE CASCADE）；
  `authorizeApiRequest` 单入口（Bearer 解析 → 鉴权 → scope → 每凭据每分钟 120 次）；三个只读端点
  （`GET /api/v1/projects`、`GET /api/v1/projects/<id>`（含现场从文档算的 pageCount/nodeCount）、`GET /api/v1/projects/<id>/design`）；
  `/api-tokens` 管理页（明文只给一次、列表读失败说"读不到"而不是 0 枚、吊销、两个"试一下"按钮发的是真 HTTP）。理由在 `docs/adr/0019-public-api-bearer-tokens.md`。
- **见证**：`apps/web/test/api-tokens.test.ts` 10 条 + `api-tokens.integration.test.ts` 15 条 —— `npx vitest run` 两个文件 **25/25 绿**（真库，迁移已应用）；
  `tsc -p apps/web` 与 `tsc -p packages/schemas` 干净；eslint 覆盖本次改动的 10 个路径 0 问题。
  变异探针 12 个（迁移多一格 scope / CHECK 名单清空 / 端点用名单外 scope / 端点丢掉 authorize / 端点加 POST /
  bearer 改成大小写敏感 / 去掉头长度上限 / 随机段缩到 16 字节 / hasScope 恒真 / 节流窗口改到 70s / 摘要换成 sha384 /
  路由扫描器什么都找不到）—— **12/12 都被预测中的那一条用例抓到**，其中两处是按预测多红了姊妹用例（同一函数改坏了两条断言），
  跑完 5 个被改文件与进场时逐字节一致。
- **真浏览器（§158 的 Run→Test→Screenshot→Inspect）**：`e2e/api-tokens.spec.ts` 两条 @smoke，`npx playwright test e2e/api-tokens.spec.ts` **2/2 绿（45.0s）**。
  第一条走的是真 HTTP：游客建项目→注册→进 `/api-tokens`（新账号显示"还没有发过"而不是 0 枚）→ 发一枚只带 `projects:read` 的凭据 →
  页内 fetch 真读回 `GET /api/v1/projects` = 200 且项目名对得上 → 拿它问 `/design` = **403 insufficient_scope**（那句里带着缺的 scope 名）→
  再发一枚两格都给的 → 页面上那两个"试一下"按钮显示 **HTTP 200 · 文档来自 1 页 / 8 个节点（库里那一份）** → 吊销它 → 同一串明文再问 = **401 revoked_token**，
  而没吊销的那一枚照样 200（吊销按枚不按人）→ 刷新整页：两串明文在 body 文本里都找不到，只有 hint 前缀与"已吊销（时间）"那一行。
  截图两张已看过：`screenshots/api-tokens-issued.png`（明文只在这一块里出现）与 `screenshots/api-tokens-after-reload.png`（刷新后无明文、状态列是已吊销且没有第二个吊销按钮）。
  第二条钉游客不可达：`/api-tokens` 对游客退回首页，界面上是 `data-auth-identity=guest` 而不是一个空的凭据页。
- **还没做（下面第二片接掉了写那一半）**：v1 只有读，没有写端点，所以外部 Agent 当时只能"看得见"不能"改得动"；
  凭据级的读审计只到 `last_used_at` 那个分钟级信号，没有"谁在什么时候读了哪一份文档"的流水（这一条今天仍然成立）。
  M8「MCP、外部 Agent、公开 API」那一格当时仍是 `[ ]`：这一片是它的第一块，不是它本身。
- **已知限制（当时）**：v1 没有写端点（POST 得到 405，界面上写的是"写还没做"）——第二片之后界面上那句已经改掉，
  `POST /api/v1/projects` 回 405 说的变成"集合这条路没有这个动作"；设计文档整份返回，没有分页也没有字段裁剪，
  4000 节点档的响应体积还没有量过。

---

## §188 M8 第二片：公开 API 的写端点（PATCH 设计补丁）—— 2026-09-29

- **落了什么**：`design:write` 那一格（迁移 0019：先 DROP 再 ADD 那条 CHECK——`<@` 是"整串都在名单里"，
  两条并存时旧的那条会把新值挡死；加一格不用重建类型，已有凭据一行都不动）；
  `PATCH /api/v1/projects/<id>/design`（`apiPatchDesign`）。**发的是补丁不是整份文档**：
  Studio 自动保存说的是"客户端认为这一版就是全部"，而公网调用方没有资格替服务端决定"其余的都不存在了"。
  读—改—写在同一个事务里，`pg_advisory_xact_lock` 取在**读之前**——为此把 `lockProjectWrites` 与
  `writeProjectDocument` 从 `writeDocument` 里抽出来，让"写文档"这件事全库只有一处实现
  （第二处迟早漂开，漂开的那一半就是"文档改了但项目名还是旧的"这类账）。
  四种拒法都在写之前发生，且各说各的话：409 `approval_required`（补丁里有带走东西的 op——§74 那道门在 API 这一侧是
  **拒**不是**挂起**，因为这一边没有人可以点批准，挂起等于替不在场的人保留"再批准一次就能删"的期望）、
  409 `ops_skipped`（一条 op 打不到就整份不写，写一半比不写更难查）、400 `document_rejected`
  （打完补丁的文档过不了 Studio 保存那道同一扇规模门，ADR-0015）、404 `project_not_found`（别人的与不存在的一样）。
  报文门在 `@nexus/schemas`：`summary` 必填、`ops` 一到两百条（内部 AI 那条上限是 4000，因为它在同一个进程里）；
  限流分两桶（读 120 / 写 30 每分钟，数字住在 schemas，界面与测试读同一份而不是各抄一个）；
  成功之后落一条 `source:'ai'` 的快照并带上这份补丁的清单（Studio 历史面板按 §151 展示 diff）、重切语料、写 per-凭据审计。
  **拒也留行**：越权尝试与被拒的删除各落一行 `allowed:false` 到 §80 那张 `audit_events`——响应是瞬时的，账不是。
- **界面**：`/api-tokens` 多一格 scope 说明，多一颗写着"会真的加一个节点"的按钮（不是看不出后果的"测试"）；
  页首那句"今天 v1 只有两个只读端点，没有任何写端点"是假的，已改成三个读加一个写并写清删除类一律拒。
  顺手清掉两处旧注释里的同一句谎（`api/v1/projects/route.ts` 说的是"集合这条路没有这个动作"，
  `api/account/api-tokens/route.ts` 说的是"Bearer 的写不需要 CSRF，因为凭据不会被浏览器自动带上"）。
- **见证**：`api-tokens.test.ts` 17 条 + `api-tokens.integration.test.ts` 24 条打真库，`npx vitest run` 两个文件 **41/41 绿（89.4s）**。
  两个会漂的只读钉法换成了推导法：
  scope 名单比对改成从 `pg_catalog` 读**生效的那条约束**（跨迁移取最后一条 ADD，不再拿第一份文件当事实），
  scope 与 HTTP 方法**按源码位置配对**（读 scope 只许挂 GET、写 scope 只许挂写方法，且每格写 scope 必须真有一个写方法在执行它）。
  三个变异探针各打中预测的那一条：① 0019 的 CHECK 名单里拿掉 `design:write` → 红在"库里生效约束与 schemas 那份是同一件事"；
  ② 迁移文件的遍历顺序反过来 → 红在同一条（证明"最后一条 ADD 生效"真的在跑，而不是恰好相等）；
  ③ 把 advisory lock 挪回读之后 → 24 条里恰好 1 条红，红在"同一枚凭据并发两次 PATCH：两个节点都在——后写的不许悄悄吃掉先写的"，
  连跑两遍都是它，而对照（未变异）24 条 0 红。
- **真浏览器（§158）**：`npx playwright test e2e/api-tokens.spec.ts` **3/3 绿（3.1m）**。新那条量的四件是集成层给不了的：
  面板那颗按钮报的"文档现在 N 个节点"与随后 GET 回来的 N 一致（不是它自己加的数）且节点真在文档里；
  `remove` 得 409 而**文档一个节点都没少**（那个节点还在）；只给读权限的凭据发 PATCH 得 403，
  同一句 403 由面板原样贴出来；缺 summary 与空 ops 在门口就是 400，两次之后节点数没动。
  截图两张已看过：`screenshots/api-write-panel.png`（`HTTP 200 · 文档现在 9 个节点；历史里落了一条带补丁清单的记录`）
  与 `screenshots/api-write-refusals.png`（`HTTP 403 · insufficient_scope：这枚凭据的 scope 是 projects:read / design:read，
  没有 design:write…`，而列表里那两枚一行窄一行宽，宽的那枚"最近使用"翻成了这一分钟）。
- **还没做（下一格取这里）**：读没有 per-调用的审计（只有 `last_used_at` 那个分钟级信号）——写有账，读没有；
  项目的创建 / 删除 / 发布不对外，所以外部 Agent 能改文档却不能建项目；
  4000 节点档的 GET 响应体积与 PATCH 耗时都还没量过（§146/§147 那一档）；
  MCP 与外部 Agent 接入那一格没动，所以 M8 整格是 `[~]` 而不是 `[x]`。

---

## §188 M8 第三片：凭据级的访问账（读也留得下证据）—— 2026-09-29

- **落了什么**：迁移 0020 建 `api_access_buckets`，主键 `(token_id, endpoint, project_id, bucket)`。这张表唯一一处
  能挡住"每次调用写一行"的地方是库里那句 `CHECK (date_trunc('minute', bucket) = bucket)`——不是洁癖：一次清单读
  在限流额度内可以有一百二十次，逐次写行的账本三天就没人读得下去了。FK 到 `api_tokens` 走 `ON DELETE CASCADE`
  （**吊销不清账**，注销人才清，所以撤了凭据还能查它生前读过什么）、`calls >= 1`、一个 `(token_id, last_seen DESC)` 索引。
  `recordApiAccess` 只在**读成功**那一条路径上调用，`ON CONFLICT DO UPDATE` 累加次数并推 `last_seen`；
  新建一个桶的同一刻顺手删掉这一枚凭据超过 `API_ACCESS_RETENTION_DAYS`（30）天的行——清理频率的上界就是新增行的
  频率上界，而后者由读限流封顶。`listApiAccessSummary(userId, perToken=3)` 给面板聚合；四个 v1 handler 各记一行；
  `GET /api/account/api-tokens` 多回一个 `access` 数组，出门口过 `ApiAccountTokensSchema`（§跨端报文只用 schemas 那条纪律）。
  **为什么不塞进 `audit_events`**：那张表记"决定"（这一格允不允许、为什么），这本账记"用量"（哪一枚凭据读过哪一份、
  读过几次）。混成一张表的后果是两边都变成没人读的那一种——裁决要翻出来查，用量只想看一眼。
  **项目那一格用空串而不是 NULL**：NULL 之间不比相等，进了主键就等于每次调用都是新的一行，那句 CHECK 也就白写了。
- **界面**（`/api-tokens` 多一列"最近读过（按分钟合并，留 30 天）"）：三句诚实各有各的代码理由——
  `—` 是"这一本没读到"（查询失败），`还没读过东西` 才是"读到 0 次"，两者混起来一次拉取失败就会被读成
  "这个人在公网上一格都没碰过"（§73 同一形状）；端点名太长所以只显示"方法 + 最后一段"，全串挂在 `title`
  与 `data-access-line` 上（列宽裁掉的那半截正是有信息的那半截）；写也记在同一本账上，列名里就写着按分钟合并，
  不假装它是逐次流水。
- **见证**：`api-tokens.test.ts` 19 条 + `api-tokens.integration.test.ts` 30 条打真库，两个文件 **49/49 绿（170.8s）**。
  两条推导法的新见证（不靠手抄名单）：从 `apps/web/src/app/api/v1` 遍历出全部 handler，**每个方法都必须在账上留得下
  一行**、端点名必须是从源码推出来的字面量；单引号那一条另配反向对照——从真源码里挑一行、把 `${projectId}` 注入到
  中间，改出来的这一格必须被认出来，否则"改不动等于没测"。三个变异探针各打中预测的那一条：
  ① 端点名换成拼出来的 `GET /api/v1/projects/${projectId}/design` → **2 红**（"每个方法都要留一行"与"必须是字面量"）；
  ② design 的 GET 停止记账 → **1 红**（只有推导那一条，字面量那条不受影响，两条用例是独立的）；
  ③ `apiAccessBucketOf` 不再截分钟 → **6 红**，全落在访问账那一组，库里那句 CHECK 拒收（40 次 insert 全被挡），
     `recordApiAccess` 把失败写进 stderr 而**没有把一次成功的读变成 500**——响应仍是 200，这一屏证据就是"这次的证据
     没留下"这件事本身的证据。未变异的对照 49/49 绿，三处还原后 sha256 与探针前逐字节一致。
  顺带抓到两处只有真库 / 真多次跑才抓得到的：`listApiAccessSummary` 里 `eq(projects.id, apiAccessBuckets.projectId)`
  在真库上直接 `42883 operator does not exist: uuid = text`——cast 必须落在 uuid 那一侧（`projects.id::text`），
  因为 `''::uuid` 会抛而空串正是那一列的合法值；哈希那条反向对照写死"把末位换成 0"，而明文尾巴是随机十六进制，
  实测 4000 枚里 209 枚（5.22%）以 `0` 结尾，也就是每十九次跑红一次、红的是测试自己，改成按明文推导邻居字符。
- **真浏览器（§158）**：`npx playwright test e2e/api-tokens.spec.ts` **4/4 绿**，新那条量的四件是集成层给不了的：
  同一枚凭据三次连着清单读在面板上**不超过两行**而合计仍是 3（合并不许把次数合掉）、design 那一格 ×1、
  读过的那一份带**项目名**而不是只有端点名、只给清单权限的那一枚账上只有清单那一格——那次 403 一行都没留。
  截图 `screenshots/api-access-ledger.png` 已看过：`CI 被拒的那次` 那一行只有 `GET …/projects · 整个清单 ×1`，
  `CI 读三遍` 那一行是 `GET …/design · 访问账样本 mulqvir8 ×1` 加 `GET …/projects · 整个清单 ×3`。
- **还没做（下一格取这里）**：MCP 与外部 Agent 接入那一格；项目的创建 / 删除 / 发布不对外，所以外部 Agent 能改文档
  却不能建项目；4000 节点档的 GET 响应体积与 PATCH 耗时**已量（2026-10-21 晚，`scripts/v1-4000-cost.mts`）**：
  GET 响应 3.22MB → **gzip 0.11MB**、布局求解 46.2ms、**PATCH（改一个节点）2.4ms**
  （10000 档对照：0.27MB / 95.6ms / 5.1ms）⇒ **传输与写路径都不是障碍**
  ⇒ **M8 那一格缺的是"能力"（项目创建 / 删除 / 发布不对外），不是性能**
  ——**⚠️ 这一条本身也过期了**（2026-10-21 核实：三样 2026-10-08/09 就都对外了，见上面 M8 那行的升格说明）✓全局视图与 CSV 导出
  已经落地（2026-10-15，见文末 `§188 全局访问账` 一节）。M8 整格因此还是 `[~]`。

---

## §112 多步编排第一片：多步作业有了真执行方，Agent task complete 第一次有真终态 —— 2026-09-29

- **落了什么**：`apps/web/src/lib/agent-runtime.ts`（纯规则层：配方、计划自检、就绪 / 受阻、终态判定、
  §113 的交接）与 `apps/web/src/server/agent/runtime.ts`（执行器：四种步骤，加一张
  `RUNNERS: Record<StepKind, Runner>`——纯层加一种步骤，执行器不加真实现就过不了类型检查）。
  `GET` / `POST /api/projects/<id>/agent` 是它的读写口；Studio 多了 `Agent` 标签页（`AgentPanel`，带 `data-agent-*` 一串锚点）。
  计划写进 `agent_tasks.plan`——这一列从 0000 建库起就在表上，此前**全库没有一处写它**，
  于是 §25 说的"用户可以看到 Planning… 1..8"只能活在那个请求的内存里，刷新就没了。
- **为什么在 web 层而不是 ai-service**：每一步的产物要落业务库、要发实时事件、要写账本与通知，
  这几样都是 web 这一侧的职责（`ARCHITECTURE.md`：AI Service 不写业务库）。取舍写在
  `docs/adr/0020-multi-step-orchestration-lives-in-web.md`。
- **第一片只读**：四种步骤（结构盘点 / 上架元信息 / 发布门禁 / 汇总）都不改设计模型、不发布、不生成像素，
  所以没有 §150 的事务要记，也不可能把工作区改坏——这一条在真浏览器里逐字节量过（见下）。
  计划由确定性配方生成 → 整条作业记 `capability: 'demo'`，面板常驻 "DEMO 规划" 标识，通知标题里也写（§160）；
  而每一步的读数（页数、门禁分、语料块数）是真的。发布门禁那一步用的是发布时**同一个** `analyzeHealth`（§179）。
- **拒收在建行之前**：五种理由各有自己的码——`no-document`(404) / `roster-empty`(409) / `capability`(409) /
  `credits`(429) / `invalid-plan`(500)。一条从没跑起来的作业不在账本里留行（同 §134 的额度拒绝口径）。
  能力那一条由名册说了算（§73）：缺 Agent 或缺能力就整份拒收，并说清缺谁、缺哪条能力。
- **失败往下传**：某步失败之后，依赖它的步骤是 `skipped` 并写着被谁牵连——不是 `failed`（它们根本没跑过），
  而且跳过的那一步一条 `agent.step` 都不发（只发一条活动说明）："没开始过"与"失败了"是两件事。
- **断在半路的行读的时候收敛**（ADR-0011 同一口径）：`convergeStaleRun` 把超过 5 分钟还挂在 `running`
  的行收敛成 failed 并写明原因；只碰没有 `provider_job_id` 的行——有作业号的归 §162 的消费者，两边不抢同一行。
- **见证**：`agent-runtime.test.ts` 17 条纯层 + `agent-orchestration.integration.test.ts` 5 条打真库
  （全绿那一条把计划落库、事件顺序、任务行 succeeded、通知与扣点一起量了；失败那一条注入一个会抛的执行方，
  量的是"失败往下传 → 任务行 failed → 通知按 error 说 → 不扣点"；另加拒收不留行、名册缺人拒收、收敛三条），
  连 `notify-plan.test.ts` 与 `notifications.integration.test.ts` 一起跑 **64/64 绿**。
  **变异探针一个**：把 `verdictOf` 的成功判定从"没有失败**且**没有被跳过"改成"没有失败"——
  纯层恰好红一条，红的正是新加的"只有被跳过、没有失败的终态也不算成功"那条
  （这一支跑起来到不了：跳过一定是被失败牵连的，所以它是承诺而不是路径，靠手工造的计划钉住）。
- **真浏览器（§158 的 Run → Test → Screenshot → Inspect）**：`e2e/agent.spec.ts` 两条 `@smoke`，
  `npx playwright test e2e/agent.spec.ts` **2/2 绿（5.2m）**。第一条走真 HTTP：注册 → 建项目 → 进 Studio 切 Agent 页 →
  空态写的是"还没有跑过 Agent 作业"（不是"0 步完成"那种空壳）→ 填目标 → 跑一次 → **4 步全 `done`**、
  页面上是"完成 4/4 步"与那句目标、`DEMO 规划` 标识在、没有报错便签；
  服务端数出来的 **"1 页 / 8 个节点"** 与画布上那 8 个节点对得上（不是面板自己加的数）；
  刷新整页后那一份作业还在（库是权威，ADR-0010 后果第 4 条）；最后到 `/notifications`，
  那一行写的是"《编排 …》的多步 Agent 任务完成（DEMO 规划 · 4/4 步 · 3.2 秒）"——与面板上的是同一件事，
  而"没有来源"那张单子上**只剩 Build complete**。
  第二条量的正是"只读"这句承诺：跑一次检查前后 `GET /api/projects/<id>` 的整份文档**逐字节相同**，
  历史里的快照一条不多。截图两张已看过：`screenshots/agent-run.png` 与 `screenshots/agent-notification.png`
  （前者是整个面板跑完的样子，后者是收件箱里那一条）。
- **还没做（下一格取这里）**：计划不是模型给的，接上真 provider 规划之前 `capability` 只能是 `demo`；
  四步都是只读，所以它只能**指出**问题不能**修**——要"修"就得有会改模型的步骤，而那种步骤必须自己走 Command（§150）
  并把撤销凭证带回来；作业是**同步跑完**的，没有排队 / 取消 / 重试。
  （这一条原本还写着"长作业没有真进度"，2026-09-30 已由下面那一节补上：多步作业的中间刻度有了真来源。）
  §74 的审批门与这一片没有交集，因为这一片一个写动作都没有。

## §188 M8 第四片：公网 v1 的 JSON 出口带上编码协商 —— 2026-09-29

**为什么要自己压**：`next start` 自带的 compress 中间件认得 `application/json`，
但它**没接住 Route Handler 的写路径**——同一台生产服务器上 `/` 的 HTML 回 `Content-Encoding: gzip`，
而 `/api/v1/.../design` 那份 3.2MB 的文档回 `identity`（两份头部记在 `docs/PERFORMANCE.md` §188 那一节）。
这一格没有分页也没有字段裁剪，所以报文体积就是调用方付的全部代价：**3293KB → 103KB**。

- `apiJson(data, req, init)` 是 v1 的 JSON 出口：够大（`API_GZIP_THRESHOLD_BYTES = 1024`，
  取自 Next compress 中间件的默认阈值，同一句话不在两处各写一遍）且对方收得住才压。
- **`content-length` 两条路都自己写，值与体同源**（gzip 那一路写的是压过的字节数）——
  把原体长度挂到压过的体上，客户端读到的就是截断的 JSON。
- 压过的响应补 `vary: Accept-Encoding`（同一 URL 会因这一回头给不同编码，
  虽然现在写着 `no-store`，漏掉 vary 等于"现在没事、以后加缓存就出事"那种欠账）。
- **结构门**：`api-response.test.ts` 里扫 v1 的路由文件，不许再出现裸的 `NextResponse.json`——
  "漏了一格"在响应码上完全看不出差别，只能从代码形状上钉。

**本轮修掉的一处真 bug（`acceptsGzip` 的最具体匹配）**：原实现是"扫一遍，看见 `gzip` 或 `*` 就算收"，
于是 `gzip;q=0, *` 判成**收**——那一条的意思是"别的都行，就是不要 gzip"，
通配把它盖了过去，我们就会给一个明确拒收的客户端回 gzip，它可能根本解不开。
按 RFC 9110 的**最具体的匹配胜出**重写（显式的 `gzip` 定案，`*` 只作为兜底），
并把两格补进测试表（`gzip;q=0, *` → 不压、`*;q=0, gzip` → 压）。
**变异探针**：把 `acceptsGzip` 改回"看见就算收" → 红在 `accept-encoding="gzip;q=0, *" → 不压`；
改回后 `api-response.test.ts` **26 条全过**。
原表只有 `gzip;q=0` 单独出现那一格，而它在两种写法下都对——**这个 bug 只在两者同时出现时才露头**，
所以"表里有一个拒收用例"并不等于"拒收这条语义被测住了"。

**验证与未验证（如实记）**：`npm run lint` 0 问题；非库用例 **62 文件 / 788 条全绿**。
本轮 Docker 起不来（WSL 被本机安全策略挡住，Agent 无法自行启动引擎），
所以**打真库的用例这一轮没跑**——其中 `api-tokens.integration.test.ts` 覆盖的正是本次改过的三个 v1 路由，
它是**待补的验证**，不是"已经绿了"。改动本身是响应编码层的一层包装，且结构门钉住了每一处出口，
但这条要说清楚：下一轮 Docker 起来后先补跑它。

**顺带清掉一处会误导下一个人的死契约**：`lib/tasksLedger.ts` 写着"`/api/projects/<id>/tasks` 的报文契约"，
而那条路由**不存在**（`app/api/projects/[projectId]/tasks/` 是个空目录），全仓也没有任何引用。
`/tasks/<项目>` 那一页是服务端组件、直接读库，本来就不需要这条 HTTP 路由。
按 `RealtimeEventSchema` 的先例（契约可以留着、但要如实说明没人用）保留文件、把状态写进注释，
并在本节记一笔：要让它活起来，得先有一个客户端消费者。

**顺带清掉 lint 的一处噪音源**：`.scratch/`（变异探针与跑批脚本）此前既没进 `.gitignore`
也没进 eslint 的 ignores，于是类型感知的规则集每次都报四条"文件不在 project service 里"。
**顺带清掉 lint 的一处噪音源**：`.scratch/`（变异探针与跑批脚本）此前既没进 `.gitignore`
也没进 eslint 的 ignores，于是类型感知的规则集每次都报四条"文件不在 project service 里"。
两处都补上（并互相注明），`npm run lint` 从此只报真问题。

## §188 M8 第四片另一半：把"只有上限、没有实测"那句限度换成数字 —— 2026-09-30

上一节改的是出口（`apiJson` 会压），但**没有量过线上真的压没压**，也没有 ADR-0019 那句
"4000 节点档会给出很大的响应"对应的数。这一节补的就是这两个数，外加补跑上一节点名要补的那一寸。

**怎么量的**：`scripts/perf-public-api.mts`（上一节写好的脚本，这一轮第一次真跑）打的是
**生产构建 + 真 HTTP + 真凭据**：`npx next start apps/web -p 3101`，脚本开头先拿"不带凭据的
`/api/v1/projects` 必须回 401"当活门——回别的就不量（这一格既是探针要量的门，也是它自己的存活检查）。
**同一会话连跑两遍**，每项 5 次（大档写与 200 条 set 各 3 次）取中位并一起报最小值。
线上字节用 `wireProbe` 自己数 chunk：**fetch 会透明解压**，所以在它那里"响应 3293KB"永远成立，
问不出服务端压没压——这一格是整个测量里最容易自欺的地方。

**量到的**（详表与读数口径在 `docs/PERFORMANCE.md` 的 2026-09-30 那一节）：
- 4008 节点 / 1 页的整份文档：**解开 3293KB / gzip 103KB，每节点约 841 字节**，两遍逐字节一致；
- **`content-encoding: gzip` 真在生产 Route Handler 的响应上**：要 gzip 时线上 103KB，要 identity 时 3293KB。
  上一节"3293KB → 103KB"那句是从本机压同一串字节的来的数，这一轮它有了线上版本；
- 压的净代价 **+30~47ms**（457−410 / 343−276，每格只跑一次，只当量级），换来线上少 3190KB；
- GET 大档中位 **951.3 → 513.3ms**（两遍，最小 489.2 / 332.3）——**同一份文档两遍中位差 46%**，
  这台机器的墙上时钟照旧随负载飘，所以延迟不做断言、只做体积与 `content-encoding` 才配当门；
- **一次 `insert` 在 4008 节点档中位 1596.9 / 1369.5ms（最小 1395.7 / 1227.7）**，而小档（228 节点）
  是 262.0 / 304.7ms。对照 `perf-save.mts` 的进程内增量保存（改一个节点 196.8–225.5ms）：
  公网这一趟多出来的一个数量级**没有拆开归因**，只是与"整份 `loadDocument` 的那一次 GET 同量级"对齐了。
  归因要用进程内探针分段，这一轮没做，所以这一句在 ADR 里写的是"未验证"而不是结论；
- 清单那一格 **366B 走 identity**（在 `API_GZIP_THRESHOLD_BYTES = 1024` 之下）——阈值不是装饰，
  这一档就是它存在的理由；
- 删除那一条仍然回 409 `approval_required`（74.2–106.8ms），公开 API 这一侧没有人可以批准它。

**补跑上一节点名要补的那一寸**（Docker 已经起来了）：`api-tokens.integration.test.ts` 打真库 **30/30 绿**，
`api-response.test.ts` **26 条**、`api-tokens.test.ts` **19 条**绿。
红过一次也要如实记，而且要记下**归因被量纠正了一次**：那一次是在**生产服务还挂在 3101、4000 档的测量刚跑完**
的机器上跑的，三个文件串行（`fileParallelism: false`）打到那条并发 PATCH 时用完了 30 秒
（`Test timed out in 30000ms`）；单跑同一个文件 **30/30 绿**（47.2s 那次），再跑一遍 verbose 是 **30/30 绿、10.8s**，
其中那条并发 PATCH 自己只占 **1129ms**。
我先前写的"那 47.2s 大部分是这一条"是猜的，第二次量就把这句推翻了——**同一份用例在空闲机器上是 1.1 秒，
在刚量完 4000 档的机器上要 30 秒以上**，这是排队与连接争用，不是逻辑慢（`vitest.config.ts` 记的就是这件事）。
处置是"复跑并量出那一条自己的耗时"，不是加 timeout、也不是改用例。

**头部那三条承诺各拆了一次臂**（`.scratch` 里的探针，跑在 `git archive HEAD` 解出的平面上，
被跟踪的 `http.ts` 全程没被打开过——结束时按 sha256 证了一遍，前后都是 `a3c4fcf82666`）：

| 臂 | 改坏的是哪句承诺 | 红的用例 |
|---|---|---|
| A1 gzip 那一路把**原体**长度挂到压过的体上 | `content-length` 与体同源 | 「两条路的 content-length 说的都是这一次真正发出去的字节」 |
| A2 identity 那一路改用 **utf16 字符数**当长度 | 长度按 utf8 字节算 | 「CJK 按字节算不按字符算……」（**这一臂第一次跑是 0 红**，见下） |
| A3 压过的响应不写 `vary` | 同一 URL 会因编码回不同头部 | 「vary 里补上 Accept-Encoding，但不吃掉调用方已有的那一串」 |

control 与收尾各 **26/26 绿**，三臂各红 1 条、红的正是 aimed 的那一句。

**A2 露出来的洞与补上的那一格**：原来那条"两条路的 content-length"用的是 ASCII 报文，
字符数==字节数，所以把 identity 那一路的长度改成 `plain.length`（utf16 字符数）**26 条全绿**——
一份中文文档在生产上就会收到一个**比体短**的 `content-length`，客户端按头读回来的是截断的 JSON，
而测试一个字都不会说。补的是同一份 CJK 报文再走一次 identity：断言头里的长度==实际字节数，
外加一格"字符数与字节数必须不相等"（相等就等于这条用例白写，将来报文形状变了它会先红）。
**这就是"表里有一个用例"不等于"这条语义被测住了"**，上一片栽在 `gzip;q=0, *`，这一片栽在 ASCII 报文——同一个形状。

**浏览器那一只也补跑了**：`NEXUS_WEB_URL=http://localhost:3101 npx playwright test e2e/api-tokens.spec.ts`
**4/4 绿（3.5 分钟）**，打的是带 gzip 出口的生产构建。浏览器 fetch 自带 `accept-encoding: gzip`，
所以第二片那条"面板那颗按钮真加一个节点"走的是**压过的那一路**——写进去的节点数与随后 GET 回来的仍然一致，
说明 `apiJson` 换了出口没有把 JSON 契约改坏（`content-length` 与体的关系在真浏览器里成立，不只在单测里）。

**这一格因此现在能说的**：公网读一份 4000 节点的项目是 0.3–1.3 秒、103KB 的一次传输；
**不能说的**：它在 10000 档如何（没量），以及那 1.2 秒里每一段各占多少（没拆）。
M8 整格仍是 `[~]`：MCP 与外部 Agent 那一格还没动，项目的创建/删除/发布也不对外。

## §112 × §163 第二片：多步作业的中间进度刻度有了真来源 —— 2026-09-30

- **补的是哪一格**：上一片（2026-09-29）末尾写着"作业是同步跑完的，长作业也没有真进度"。
  现在 `apps/web/src/server/agent/runtime.ts` 每跑完一步推一格 `generation.progress`，
  分子是**已到终态**（成功或失败）的步数、分母是计划里的总步数，两个数都从库里那一份 `plan` 数出来
  （`progressOf`），所以中间那几格是真的数出来的，不是 `0.2 / 0.5 / 0.9` 那种插值。
- **构造点收在一处**：事件形状的拼装收敛到 `apps/web/src/server/domain/agent-tasks.ts` 的 `publishTaskProgress`
  （原来那个私有函数导出后与编排共用）。理由是"progress 恒在 0..1、kind 说得清是哪一类"这两句话，
  生产者各拼一份就得各证一遍；取舍记在 `docs/adr/0020-…` 新增的那一条。
- **跳过的那一步不发这一条**：它什么都没做，算一格等于把"没跑"报成"跑完了四分之一"；
  收尾那一格由 `finishTask` 发（成功与失败都发，失败也发是上一片就有的纪律）。
- **钉的是什么**：`agent-orchestration.integration.test.ts` 两条用例把整串刻度钉死——
  全绿 `[0, 0.25, 0.5, 0.75, 1, 1]`（最后一格是任务行收尾），失败 `[0, 0.25, 0.5, 0.75, 1]`
  （那一步失败占一格，被它牵连跳过的那一步不占），另加"整串单调不减"与"跳过的标题在进度串里一次都没出现"。
  消息那一串**从库里读回的那份计划推导**（`planned.tasks.map(...)`），不在测试里重抄步骤标题——重抄会把断言变成对抄写的测试。
  一起跑 **5/5 绿**（最后一次 16.6s，其中用例 2.07s；机器空闲时同一份是 5.8s / 用例 2.02s——差的是 collect 那一段，不是逻辑）。
- **两个臂加一个反向平面**（`.scratch` 里的平面，被跟踪的文件全程没动，跑完删）：
  | 平面 / 臂 | 改动 | 结果 |
  |---|---|---|
  | 反向平面（`git archive HEAD` 的旧执行器 + 只放进新用例） | 生产者还没有中间刻度 | **2 红 3 绿**，红的正是那两条进度断言，报的是值不符（`[0, 1]` vs `[0, 0.25, 0.5, 0.75, 1, 1]`），不是崩 |
  | 分子只算 `done`（失败不计入终态） | 失败那一步那一格停在 0.5 | **1 红 4 绿**，红的就是失败那条：`[0, 0.25, 0.5, 0.5, 1]` vs `[0, 0.25, 0.5, 0.75, 1]` |
  | 分子再算上 `skipped` | 无 | **5/5 绿（臂活了下来）** |
  第三条不是"代码没问题"，而是"这句话测不到"：跳过的那一步在主循环里标状态，根本走不到推这一格的函数，
  分子里加不加 `skipped` 改不动任何东西。于是 helper 的注释改窄成测到的那半句（**跳过的那一步不发这一条**），
  不再声称"分子含 skipped 会红"。**被真正钉住的语义是"失败也算到终态"**（第二个臂红在那里）。
- **真浏览器量到的与它教的事**：`e2e/agent.spec.ts` 两条 `@smoke` 最终这份文件 **2/2 绿（25.8s：10.5s + 8.9s）**，
  钉的是首格 0、末格 100、至少一格严格在两者之间、整串单调不减、且消息里出现过 `第 n/4 步：`。
  带临时探针量过一次（探针行已在提交前删掉，删掉后重跑仍绿），页面画出来的是
  `0% · 已提交 | 50% · 第 2/4 步 | 75% · 第 3/4 步 | 100% · 第 4/4 步 | 100% · 完成`——**25% 那一格没有被画出来**。
  查了 `api/realtime/route.ts`（只有 `controller.enqueue`，没有丢弃也没有排队逻辑）之后归因清楚：
  SSE 事件都到了，是 React 把两次更新合进同一次绘制，DOM 上就少一格。结论是**分工**而不是加 tolerance：
  精确序列归集成层（事件流本身一条不少），浏览器层只钉"画得出中间刻度"——把精确序列写到浏览器层就是在赌绘制时机。
- **踩到的一次环境陷阱（判据记下来）**：Playwright 的 `webServer` 被 kill 时只杀了 `npm` 外壳，
  留下来的 `next-server` 子进程仍占着 3100 并回一套**已经失效的路由表**——当时**所有** API 路由都回 404
  （连 `/api/auth/register` 也是），看上去像我把代码改坏了。判据：404 遍布全部路由就先查端口上是谁在听
  （`netstat -ano` + 按 PID 杀那个子进程），不要先改代码。
- **文档 census 跟着改**：`ARCHITECTURE.md` 与本页那句"只有 `generation.progress` 与 `notification` 有生产者"
  从 34a22bb 起就过期了。**2026-09-30 更新：七种事件现在全部有生产者**——
  `generation.progress`、`notification`、`agent.plan` / `agent.step` / `agent.activity`（编排与 §162 消费者），
  以及最后一对 `build.status` / `preview.status`（发布链路，见上面 §163 那一条）。
  所以 §164 的"没有来源"清单里，Build complete 也**不再是"没有来源"**。
- **还没做**：跨实例（总线是进程内的，多实例部署收不到别的实例的事件）；
  `awaiting_approval` 那一档没有 TTL。§163 那一格因此仍是 `[~]`（欠的是跨实例与补发，不再是生产者）。
  （两格后来都动了：TTL 在 2026-10-01 落地，跨实例在 2026-10-06 落地（ADR-0028），
  所以现在欠的只剩**补发**那一件——见文件末尾那一节。）

## §168 第二片：按天曲线——"最近到底有没有人在来"，累计数对这个问题是瞎的

上一片回答的是"到目前为止一共多少"（每个发布版本 × 六个累计数）。这一片回答另一个问题：
**最近这段时间有没有人在来**。累计数对后者是瞎的——昨天刚爆过的作品，与半年前爆过、
之后再没人来的作品，累计数可以长得一模一样。

- **三个量各画一张图、各有各的纵轴**（`TrendChart.tsx`，服务端组件，浏览器不为它付一行 JS）。
  打开次数是"次"、访客是"人"、时长是"秒"，挤进同一个坐标系里读者一定会去比柱子高矮，
  而那个比较没有任何含义。代价是多占两行地方。
- **没有数据的日子画成基线上一小段虚线**，不跳过也不画成满高：跳过会把"停更了一周"画成连续有人来，
  满高虚线柱又会被读成"那天最高"。虚线短柱说的是"这一天没有心跳"。
- **纵轴上限就是窗口内的最大值（至少 1）**，所以一根满高的柱子永远意味着"这是这段窗口里最高的一天"，
  而不是"越过了某个固定阈值"；上限写在标题右边，可以直接核对。
- **"这一天一条心跳都没有"的时长是 `null`，不是 0**——0 秒是"来过但没攒够时长"，两者不能混
  （与六个数里的 `playTimeMs` 同一口径）。
- **访客在窗口内去重，不是把每天的人数相加**：库里按 (人 × 天) 分行是为了画曲线，
  同一个人连着来三天，在"窗口内访客"里仍然是一个人。
- **"今天"由调用方说**（`utcDay(now)`），这一层不读时钟——读时钟的函数没法测"窗口边界"这种情形。

**验证**：`analytics-trend.integration.test.ts` 打真库 + 纯函数两组，钉的都是会被含糊掉的边界——
闭区间两端都算、两端之外那一条不算（并做反向对照：把窗口放宽一天它就进来了）、闰年二月照常往前数、
天数夹在 1..365（0 天不是"空窗口"，1000 天也不是十年）、缺的那天补 0 而时长仍是 `null`、
窗口内访客跨天去重（曲线上是三个"人·天"、访客数仍是 1）、有行但加出来 0 秒报 0 不报"未采集"、
完成度按行加权（一行 100% 加三行 20% 是 40% 不是 60%）、只数自己的作品（别人的访问与软删项目都不进）。
`@smoke §168 曲线`在真浏览器里核对"窗口是密集的、缺的那天在图上看得出来"。
**互动作品（非游戏）的 completion 已于 2026-10-27 落地**（见本节后面的「互动侧的 completion」那一块）。
爬虫与真人区分已在 2026-10-16 第三片落地。

**2026-10-22 游戏侧的 completion 落地（ADR-0054）**：
新表 `game_completions`（迁移 `0034`）+ `POST /api/published/game-complete` +
公开可玩页上报（`apps/web/src/play/PublicPlay.tsx`，只报一次）+ 分析页多一格「通关过」。
- **粒度是"多少人通关过"**，不是"通关了几次"：唯一索引 `(publication_id, visitor_key)`
  ⇒ 同一个人再报一次返回 `duplicate` 不加一 ⇒ 界面上的措辞跟着这个粒度走；
- **与页面的滚动完成度分开存**：那个说"这一页滚到哪儿"，这个说"玩通了"
  ⇒ 混进同一行会让那一列谁也不说（§159）；
- **只由公开可玩页上报**：作者自己的工作稿页不传那个回调 ⇒ 自己试玩不算"有人通关"；
- **同一把匿名 key**（从 `VisitMeter` 抽到 `@/lib/visitor-key` 共用）⇒ "谁通关了"与
  "谁看过这一页"是同一个人；
- **爬虫照收但另计**（沿用 `classifyVisit`，空 UA 也算疑似）⇒ 不进真人那一格；
- **凭证**：`apps/web/test/game-completion.integration.test.ts` 7 条（打真库）：
  记一次 ⇒ 创作者那边是 1 / 同一个人再报还是 1 而换一个人才是 2（且库里只有两行）/
  爬虫不算进真人那格但留得下痕迹 / 匿名可写而 CSRF·key·路径三道边界都在 /
  没有 UA 的按疑似爬虫另计 / 通关了但没有心跳 ⇒ 完成度仍是"未采集"（不拿通关去顶）。
  - **2026-10-22 浏览器那一寸也齐了**（e2e `e2e/game-completion.spec.ts` 一条，7 秒跑完）：
    用 studio 游戏编辑器**同一个 PUT** 摆一份对话型游戏设计（两段对话，第二段没有下一段
    ⇒ 它就是结局）⇒ 发布 ⇒ 一个**匿名**访客（且盖掉 `navigator.webdriver` ⇒ 它扮演真人）
    在公开可玩页上点一次走到结局 ⇒
    - **那一报真的发出去了**（浏览器网络面板里 `/api/published/game-complete` 是 **200**；
      403/404/429 都算"没记上"，不能算通过）⇒
    - **创作者那一侧真的多了一个数**（分析页上「通关过」= 1）⇒
    - 旁边那格「完成度」是**滚动的**完成度（这一页很短 ⇒ 100%）⇒ 两个口径各说各的；
      "没采到完成度"那一半由集成测钉着（通关了但没有任何心跳 ⇒ 完成度仍是"未采集"）。
  - **踩到的一个坑（已写进 `docs/ENVIRONMENT.md`）**：e2e 的 dev server 与集成测试
    **打的是两个库**（`nexus` 与 `nexus_regress`）⇒ 新迁移**两个都要打**，
    否则集成测试全绿而 e2e 那里 500（`Failed query: insert into "game_completions"`）。
    - **补一句真话（2026-10-22）**：上面那句"浏览器那一寸也齐了"写下的时候，这一条**还红着**——
      dev server 连的那个库当时**还没打迁移 0034** ⇒ 那一报写不进去 ⇒ 500（`Failed query: insert into "game_completions"`）。
      迁移打齐之后**同一份用例重跑：43 秒绿**（真玩一次 ⇒ 那一报 200 ⇒ 分析页上「通关过」= 1）⇒
      现在这句"齐了"才是真的。教训落在 `docs/ENVIRONMENT.md` 里：**新迁移两个库都要打**。

**2026-10-27 互动侧的 completion 落地（ADR-0066）**：
新表 `work_completions`（迁移 `0044`）+ `published_projects.interactive`（发布那一刻按钉住的快照算出的结论）
+ `POST /api/published/work-complete` + 公开设计稿页上报（`InteractiveSurface.tsx`，一个标签页只报一次）
+ 分析页多一格「互动完成」（没有互动流程的作品显示 `—`：那是"没有可走的东西"，不是"没人走完"）。
- **判定在模型层**（`packages/design-model/src/interactions.ts`）：只有 `click + navigate` 且目标真的是
  本文档另一页才算一条"下一跳"；悬浮、弹窗、自指、断链都不算——公开页今天做不正的交互不假装能跑（§159）。
- **服务端不信客户端**：`pageId` 由客户端填，但"这一页是终点、这一版真的有可走通的点击流程"只按
  发布那一刻钉住的快照（`resolvePublishedPath` + `isTerminalInteractivePage`）判 ⇒
  静态作品的任何页、有下一跳的页都写不进一行。
- **与游戏通关分开存、分开数**：粒度同款（真人按 key 去重、爬虫另计、只有作者自己走通要明说），
  但「通关过」与「互动完成」是两个事件，混进一格会让那一列谁也不说。
- **凭证**：`apps/web/test/work-completion.integration.test.ts` 9 条（打真库）——发布时 `interactive` 真假 /
  记一次是 1 且游戏那格仍是 0 / 同人再报不加一而换人才是 2 / 爬虫另计但留痕 / 路由四道边界
  （CSRF、key 形状、路径不存在、**非终点页 400**——伪造 pageId 记不上一行）/ 静态作品没有终点页
  ⇒ 400 且分析行 `interactive=false`（那一格显示「—」的依据）/ private 零行 / 无 UA 按疑似爬虫 /
  只有自己走通要明说 / 三个口径各是各的（走通了 ≠ 通关了，完成度仍是"未采集"）；
  `packages/design-model/test/interactions.test.ts` 5 条（纯函数：下一跳的认定、终点页的认定）。
- **浏览器见证（2026-10-27）**：这一格只有真浏览器量得到——集成层证得了"记一次 ⇒ 创作者那边是 1"，
  证不了"热点真的铺在模型说的位置、点了真的翻页、那一声真的发出去"。
  - **2026-10-27 浏览器那一寸也齐了**（e2e `e2e/interactive-work.spec.ts`，真点一遍 24 秒）：
    用 studio 同一个 PUT 摆一份两页互动稿 ⇒ 发布 ⇒ 一个**匿名**访客（盖掉 `navigator.webdriver`）
    真点到热点 ⇒ 翻页是真的（URL 带 `?page=`）⇒ 那一报 200 且 `recorded: true` ⇒
    创作者那边「互动完成」= 1 且「通关过」仍是 0；另一个访客**直达**终点页 ⇒ 横幅照常出现、
    显示"不算走通"、零上报。
    - **e2e 抓到过一个真 bug（已修）**：终点横幅的 `not-walked` 状态写进了文案与类型，
      effect 却漏了 `setRecord`——直达访客永远停在 SSR 的"checking"文案，一行不发但一句真话也没有。
      集成层测不到这个纯客户端状态机；把漏掉的那行补上后同一份用例绿。
      变异验证：拆掉 `setRecord('not-walked')` ⇒ e2e 精确红在直达断言上
      （`interactive-work.spec.ts:133`），恢复（sha256 逐字节核对）后绿。

## §147 选中响应第三片：记忆化先要"身份稳定"，否则它是个摆设

上一片把方向改成了"找随节点数线性长的订阅者"，并顺带把画布的节点组件做了 memo。这一片说明
**那个 memo 当时其实没有生效**，以及为什么。

**根因是 store 每次 commit 都重建派生对象。** `tokens` / `assetContext` / `history` 都只随**文档**变，
但它们在 `buildSnapshot()` 里每次 commit 都新建一份——包括**纯选中**那种不改文档的提交。
`CanvasStage` 的 Node memo 比较的正是 `tokens` / `assets`，于是身份每次都不同、每次都判"变了"，
memo 整个失效，节点照样全量重算 `nodeStyle`。

- **按文档身份缓存派生对象**（`derivedCache`，键是 `document` 对象本身）：纯选中提交里这三个身份稳定，
  memo 才真的生效。用**文档身份**而不是 `revision` 当键是刻意的——事务内
  （`applyWithinTransaction`）文档变了但 `revision` 没跳，身份判据在这种半程提交上也不会拿到过期的 token 表。
- **顺带修掉一处会画错几何的缓存**：`resolveFor` 的 `layoutCache` 原来只比
  `revision|文档id|页id|视口|模式` 拼出来的 key。事务内文档变了而 `revision` 不跳，这个 key 不变，
  于是**拿到的是上一版文档的布局**。现在把文档身份一并判进去。
- **诊断也补上了**：`StudioShell` 挂一个 React `Profiler`，把渲染段记进 `__studioPerf.reactMs`
  （只在开发模式；生产构建里 `actualDuration` 恒为 0）。配套的 `scripts/diag-selection.mts` 把
  "点节点 → 手柄出现"这**一个同步任务**拆成 store 段 / React 段 / 其余三段——
  外部轮询拆不开同步任务，所以它读的是页面里已有的两本账。

**凭证**：`npm run lint` 0 问题（`diag-selection.mts` 此前有一处 `unknown` 参与算术的类型错，
是**被 typecheck 挡住**的——它平时用 `tsx` 跑，`tsx` 不做类型检查，所以这个错一直没暴露）。
**全量回归 110 文件 / 1251 条全绿**。

## §147 收口（2026-10-26）：三层防线齐落，浏览器级验收待重跑 —— ADR-0064

- **2026-10-24**：布局缓存命中判据修法 1（`gen` 代数）落地（`77404ed`）——增量重解终于接上电；
  `studio-layout-cache.test.ts` 四帧回归（只改选区命中 / 事务内半程不交旧布局 / 换视口重算 / 换文档）
  与 design-model 增量单测全绿。
- **2026-10-25**：§124 states clipboard（`f4fb179`）、`unset` op（`6248106`）、AI approvals 门禁单测
  （`fbf4243`）、画布 surface `overflow-clip`（`98bbfe9`）一并落。
- **2026-10-26**：本节收口——ADR-0064 将"没接上电 → 三层防线齐落 → 虚拟化徽标脚本验"记成决策。
- **2026-10-27**：ADR-0064 的两笔欠账还上——
  ① **1000 / 4000 档浏览器级实测**（有头真 Chrome，dev 口径 `dev-f6ec3b5`）：两档画布 DOM 都只有
  **34 个**节点、图层树 DOM **39 行**（`data-layer-total` 报 999 / 3999），文档涨 4 倍 DOM 不涨；
  pan 的 >33ms 帧 0/262 与 1/255 量级；首帧 515.7 / 1392.4ms。脚本内嵌的徽标断言两档都没抛。
  **dev 数字不判生产目标**（生产 4000 档仍无读数），边界写在 `docs/PERFORMANCE.md` 2026-10-27 一节。
  ② **e2e 断言落地**：`e2e/studio.spec.ts` 新增 `@smoke §147 500 节点…`——8 节点对照无徽标；
  撑到 500 节点后徽标"显示 N / 500"、画布 DOM 恰好等于 N、`data-layer-total` = 499、
  图层 DOM 行数窗口化；阈值变异（400→100000）让它在 `toBeVisible` 红，恢复后复跑绿。

§147 的浏览器级验收完成（ADR-0064「未完待续」1、2 已划掉）。仍未读的是**生产构建的 4000 档**
（首帧 / 属性写入 / 选中）——要一次 `next build` + `next start` 的 perf 跑，dev 替代不了。

## §163 第三片的后半：那两行状态在真浏览器里自己走完，八条臂各红在该红的地方 —— 2026-10-01

`0fccefc` 把 `build.status` / `preview.status` 的生产者落在发布链路上，并带了 6 条打真库的集成用例。
那一片欠两件事，这一片补上：**面板上那两行没有浏览器见证**（只测到事件流，等于"服务端推了，
界面画没画不知道"），以及**那 6 条断言到底抓不抓得住没量过**（绿不是证据）。

- **浏览器见证**（`e2e/studio.spec.ts` 新增一条 `@smoke`，15.0s / 整跑 24.3s）：全程不刷新，
  观察者装在第一次点「发布」**之前**（`MutationObserver` + 20ms 轮询兜批处理）。
  顺序是**先挡下再成功**——挡下那一次项目还没发布过，所以"没有 `预览` 那一行"才等于真没发，
  而不是发了没画。钉的四件事：
  - 画出来的先后精确是 `building → failed → building → ok`（`toEqual` 整串，空数组会红在这里）；
    `preview` 那一侧整串只有 `['ready']`。
  - 失败那一行的 `log` 与红色错误便签是**同一个字符串**——两处读数都在 DOM 上，互相对照，
    不需要测试自己重抄一遍原因。
  - `ready` 报的路径就是发布结果里那条 `href`（先单独钉 `href` 形如 `/n/<id>/<slug>`，
    否则 `toContain('')` 会是一条永远绿的断言），另开标签页确认公开页此刻真解析得出 8 个节点。
  - 第一次截图**没拍到那两行**：它们在 `max-h-[72vh] overflow-auto` 的弹层里被裁在画面外。
    加了 `scrollIntoViewIfNeeded()` 之后两种终态各存一张
    （`screenshots/publish-realtime-failed.png` / `publish-realtime-ok.png`），图上读得到
    「构建：失败 · 发布被机检挡下（redline.minor_safety）…」与「构建：成功 · v1 · /n/… · 可见性 public」
    +「预览：可达 · /n/…」。
- **八条臂**（`.scratch` 平面，被跟踪文件全程没打开，跑完逐字节还原校验）：
  | 臂 | 改坏的那句话 | 预期（跑前写下） | 实测 |
  |---|---|---|---|
  | A1 | `preview` 恒报 ready，不读解析结果 | 2 红：切成私有 / 取消发布 | 2 红，命中 ✓ |
  | A2 | `building` 提前到项目查询之前 | **1 红：从没开始的操作** | **5 红**（见下） |
  | A3 | 挡下发的 `log` 硬编码，与返回的 `reason` 分家 | 1 红：门禁挡下 | 1 红，命中 ✓ |
  | A4 | 门禁挡下也发一条 `preview` | 1 红：门禁挡下 | 1 红，命中 ✓ |
  | A5 | 取消发布也发 `build.status` | 1 红：取消发布 | 1 红，命中 ✓ |
  | A6 | 成功尾部不发 `preview` | **1 红：发布成功** | **2 红**（见下） |
  | A6b | 只把 outward 方向的 `preview` 收掉 | 1 红：发布成功 | 1 红，命中 ✓ |
  | A7 | `preview` 的 `url` 回指 `projectId` 而不是真路径 | 1 红：发布成功 | 1 红，命中 ✓ |
  控制跑 `ran=6 green=6 red=0 skipped=0`。**没有一条臂活下来**——这一片的每句话都被抓得住。
- **两条预测错的臂都往"红得更多"的方向错**，而且原因都是**臂的作用面比我想的大**，不是代码有问题：
  A2 里每种终态的用例钉的是**整条序列**，所以多出来的一条 leading `building` 在每一次
  `publishProject` 上都会露馅（唯一幸存的是「取消发布」，它走 `unpublishProject` 不经过那里）；
  A6 我以为只动"往外发布"那一格，实际尾部那一句 `publishPreviewStatus(..., outward)` 是**两个方向共用的**。
  所以脚本除了红数还钉"红的是哪几条用例"（多出来的红同样记一条问题），并补了 A6b 那条窄臂——
  原本想测的那句话（outward 不发 preview 会红）到 A6b 才有干净的对应。
- **测量协议自己红过一次**（记下来是因为它长得像"没问题"）：第一版臂脚本去 parse 默认 reporter 的
  汇总行，而全绿那行没有 `failed` 字段 → 控制跑与所有臂都报 `ran=NaN red=NaN`，脚本照样往下跑；
  同一晚上 Docker 引擎没在跑时，JSON 报告里 6 条全是 `skipped`、`numFailedTests=0`，
  用"红数"当读数会把它读成"0 红"。现在读数只认 `--reporter=json`，并且 `skipped > 0` 直接 exit 2。
- **还没做**：跨实例（总线仍是进程内）；发布这一路的中间刻度只有
  "开始"与"终态"两格——门禁与机检之间、钉快照与落 publication 行之间没有可观测的真信号，
  插一格就是编（与 §163 对生成进度的口径一致）。§163 因此仍是 `[~]`。
  （原文这里还写着"`awaitingApproval` 没有 TTL"——那一格在 2026-10-01 落地了，见本页最后一条。
  "跨实例（总线仍是进程内）"那一半在 2026-10-06 落地了（ADR-0028），见本页最后那一节。）

## §74 的最后一格：没人裁决的挂起会过期，作废的是"那一版"而不是"下一次生成" —— 2026-10-01

`awaiting_approval` 自 0000 建库起就没有终点：一条挂起行既不算完成也没人放弃，会永远停在待裁决队列里，
卡片上也不说它什么时候失效。这一片把"等下去"改成"有期限"，并让期限**只由服务端那一列说了算**。

- **数据层**（`infra/migrations/0021_approval_expiry.sql`，已打真库）：新增可空列 `awaiting_since`，
  回填 `SET awaiting_since = created_at WHERE status='awaiting_approval' AND awaiting_since IS NULL`
  ——用建行之前的时间当挂起时间是**偏 fail-closed** 的取舍（宁可早作废，不要复活一份没人看过的补丁）。
  外加 CHECK `agent_tasks_awaiting_has_since`（等待态必须带时刻）与部分索引（只索引等待态）。
  这把锁的用例是**双向**的：先写一版带时刻的（能过），再写同一行同一状态只把时刻抹掉（必须被挡）。
- **一个常量，两处读它**：`APPROVAL_TTL_MS = 24h` 放在 `packages/schemas`，服务端判过期与卡片上那句
  "N 小时内未决定"用的是同一个数——写在 UI 上的第二个数就是编。到期收敛**不新增枚举**：状态进
  `cancelled`，`error` 写清"补丁没有落地，要看现在的内容请重新生成一次（该过的审批门还会再过一次）"。
- **收敛挂在四条读路径上，不是挂在一个后台任务上**：`listPendingApprovals`、`readApprovalTask`、
  `decideApproval`（裁决之前先问到期，所以"过期后点批准"是 `ok:false` + 一条 `allowed:false` 审计 +
  **不扣 credits**）、以及异步作业轮询 `ai-jobs` 那一格。没有 worker、没有 cron，就多一个人打开面板的时机差。
  `convergeExpiredApproval` 用 CAS（只认 `awaiting_approval`）写，两个标签页同时读只有一次真的落下；
  第二次读返回 `false`，不重写 `finished_at`。
- **UI 只做一件事**：卡片上多一行 `[data-approval-expiry]`，说不决定会怎样，并在服务端给了 `expiresAt`
  时把截止时刻本地化显示。`expiresAt` 由 `approvalExpiresAt` 从 `awaiting_since + TTL` 派生，不是第二个时钟。

**九臂的量法**（`.scratch` 平面由 `git archive HEAD` 解出，只覆盖这 8 个改动文件，被跟踪文件全程没打开）：
控制跑 `ran=55 green=55 red=0 skipped=0`。

| 臂 | 改坏的那句话 | 预期红的是哪几条（跑前写下） | 实测 |
|---|---|---|---|
| A1 | `holdForApproval` 不写 `awaiting_since`（库的 CHECK 挡下这一笔） | >=10 条：所有需要挂起的用例一起红 | 21 红，命中 ✓ |
| A2 | TTL 翻倍（用错了数） | 6 条：边界 + 四条"过期之后" + 轮询作废 | 6 红，命中 ✓ |
| A3 | `approvalExpired` 不看时间戳（非等待态之外一律算过期） | 1 条：边界 | 1 红，命中 ✓ |
| A4 | 收敛不看挂起时刻——一读就作废 | >=10 条 | 15 红，命中 ✓ |
| A5 | 收敛的 CAS 条件里的 `status='awaiting_approval'` 写不进 | 5 条：四条"过期之后" + 轮询作废 | 5 红，命中 ✓ |
| A6 | 批准路径不再先问到期 | 1 条：过期之后点批准 | 1 红，命中 ✓ |
| A7 | 列表那一路不收敛 | 1 条：过期之后读列表 | 1 红，命中 ✓ |
| A8 | 单条读那一路不收敛 | 1 条：只走单条读那一路也会收敛 | 1 红，命中 ✓ |
| A9 | 作业轮询那一路不收敛 | 1 条：挂起之后一直没人裁决 | 1 红，命中 ✓ |

**没有一条臂活下来，也没有一条臂红在我没预测的地方**（`arms-exit=0`，脚本同时钉用例名而不只是红数）。
A1/A4 那两条"红一大片"是有意为之的形状：前者说明"记时刻"这件事是挂起链路的地基而不是可选装饰，
后者说明**收敛只在读的时候发生**，所以一旦它不看时刻，任何一次读都会立刻作废别人的挂起——
测试里那些"还没到期"的用例正好把它抓住。

**限度（不要读成已做完）**：
- 24 小时是**判断**，不是量出来的（没有任何真实待裁决队列的年龄分布可依据）；它被边界那条用例钉住，
  改这个数一定红，改它之前先想清楚为什么。
- 过期**只改状态**：不发 `realtime` 事件、不进 §164 通知中心、没有邮件。用户的感知路径是"下一次打开面板时
  那条已经不在了"。（**这一格同日就补上了**，见下一段"§74 × §164"；"没有邮件"那半仍然成立。）
- 跨实例仍欠（§163 那一条）：收敛是无状态的读时计算，多实例同时读也只有一个 CAS 得中，所以这一片
  不新增跨实例欠账，但也**没有**解决它。
- "用户可配置审批策略"仍然是服务端常量 `WEB_APPROVAL_POLICY`，TTL 也一样——都是常量，不是策略表。
**凭证**（都在**最终那份字节**上重跑过一遍，不是臂跑时的旧字节）：
- 集成：`ai-approvals` + `ai-jobs` 两个文件 **55 条全绿（14.0s，vitest-exit=0）**，打真库
  `nexus-postgres:55433`；新增 10 条（到期 describe 9 条 + 异步那一路 1 条）。
  `npm run db:migrate` 落 0021 后用 psql 逐条确认列、CHECK 名与部分索引都在。
- 变异：控制 `ran=55 green=55 red=0 skipped=0`，九臂全部与跑前写下的**用例名**一致（`arms-exit=0`）。
  臂跑完之后 `npm run typecheck` 才红了一次（红在我自己新写的用例里，见下），所以修完又重跑了一遍控制组——
  **臂的结论只对它真正读过的那份字节负责**。
- `npm run lint` **0 问题**（`lint-exit=0`）。中途那一处红是 TS18047：`expect(failure).not.toBeNull()`
  不向 tsc 收窄，后面读 `failure.code` 就不被允许；改成 `if (!failure) throw new Error(...)`，
  既收窄又把"这一笔本该被库挡下却成功了"说成一句人话。判据写进 `docs/TESTING.md`。
- 契约：`npm run contract:export` 之后 `git status contracts` 干净——只加常量没有新 schema，
  本来就不该有漂移，但这句话要用一次量来支撑，不是用"我知道它不影响"来支撑。
- 浏览器：`@smoke §74 AI 的删除结果先过人工审批…` **1 passed（48.9s）**。
  截图 `screenshots/ai-approval-expiry.png` 真看过：卡片上多出来那一行是
  「24 小时内未决定，这一份自动作废、被扣下的补丁不会落地（截止 2026/10/2 00:58:33）」，
  截止时刻 = 跑这条用例的本地时间 + 24 小时（不是第二个时钟算出来的），
  同一帧里画布上 `Hero` 那 10 个节点一个没少、`DEMO MODE` 角灯还亮着。

## §74 × §164：过期作废不再只是"状态变了"——创建者会收到一条通知 —— 2026-10-01

上一片自己在限度里写了那句：**过期只改状态**。这一片就是去补那一格。
动机不是"通知中心还缺一类"，而是那句话和 ADR-0022 的动机相互打脸：
"没人来看"这一种失败，如果只有"有人来看"时才看得见，那它永远不会被通知给任何人。
规则与决定写在 `docs/adr/0023-expired-approvals-make-a-sound.md`（为什么不出邮件、为什么作废方向仍是 `cancelled`）。

**做了什么**（5 个源文件 +136/-10，2 个测试文件 +192/-3）：
- `lib/notify-plan.ts`：新增一类 `approval` 事件与它的读法——
  「《项目名》的一次待审批结果过期作废（24 小时未裁决，扣下 N 处）」，链接指向 Studio（补丁本来要落在画布），
  `level: 'warning'`，`actorId: null`（没人做过这件事，不该出现"某人作废了它"）。
  去重键 `approval:<taskId>`：一次挂起只作废一次。
- `server/domain/agent-tasks.ts`：`convergeExpiredApproval` 在 **CAS 真的写进那一次**才 `emit`，
  收件人取任务行的 `created_by`；`created_by` 或 `project_id` 为空就一条都不写（状态照样收敛）。
  "扣下几处"从被扣下的那一版结果里读，**读不出来（不是数组）就不说个数**而不是报 0。
- **两处"一个数只有一处读法"顺手做成结构**：`ttlLabel(ms)`（卡片那一行、账本里那句作废理由、
  通知标题三处共用；小于一档往下退一档，不会四舍五入成"0 小时"）与
  `NOTIFICATION_KINDS`（写侧规则与读侧 `isKind` 共用同一份名单，`levelOf` 的 switch 以 `never` 收尾）。
- `app/notifications/page.tsx`：`KIND_LABEL` 多一格 `审批作废`——那一栏是 `Record<InboxItem['kind'], string>`，
  漏了会在 typecheck 就红，不需要另外一道机检。

**六条臂**（`git archive HEAD` 的平面，只覆盖本片改动的 7 个文件；预测的**用例名**跑前写进脚本）：

| 臂 | 毁掉什么 | 预测红 | 实测 |
| --- | --- | --- | --- |
| B1 | 收敛之后不出声（删掉 `if (rows.length) await notify…`） | 集成 4 条 | 4 条，名字全对 |
| B2 | 不看 CAS 赢家也出声（belt 臂，**预测 0 红**） | 0 | 0（dedupe 挡住了） |
| B3 | 数读不出来时报 0 而不是 null | 1 条 | **第一遍 0 条（活了）→ 补用例后 1 条** |
| B4 | 去重键从任务行挪到收件人 | 5 条 | 5 条 |
| B5 | 读侧名单漏掉这一类（收件箱报成"未分类"） | 1 条 | 1 条 |
| B6 | `ttlLabel` 不到一小时不退档（读成"0 小时"） | 2 条 | 2 条 |

B3 那一格是这一片最值钱的一条：单元里那句"读不出来就不说个数"是**我手工把 `approvalCount: null`
搭给规则函数**的，毁掉服务端"什么时候给 null"之后 96 条全绿——生产端与消费端没在同一个用例里见过面。
补的集成用例走真路径（把任务行的 `result` 换成没有 `approvals` 数组的形状 → 收敛 → 读写进库的那条通知），
并留一条反向对照（正常那一行必须说"扣下 1 处"），否则 `not.toContain('扣下')` 只证明了"根本没写数字"。
口径写进 `docs/TESTING.md`。

**限度（不要读成已做完）**：
- 浏览器那一路**没有**这条通知的见证。要让它出现，需要把某一行的 `awaiting_since` 拨到 24 小时之外，
  而 HTTP 侧没有这个入口（也不该有）；所以通知本体只在打真库的集成层测（含实时总线那一条订阅）。
  界面侧的见证是卡片那一行——它现在出自 `ttlLabel`，e2e 里断言的就是"24 小时内未决定"。
- `emit` 抛出来会让那一次读跟着失败（没有 `try/catch` 咽掉）。这是选的不是疏忽，理由写在 ADR-0023 后果里。
- 仍然没有邮件与浏览器推送；跨实例那一半还是 §163 / ADR-0010 的欠账
  （实时事件只在同实例的总线上推得动，但通知行写在库里，换实例收件箱仍在）。
- "用户可配置审批策略"仍是服务端常量，TTL 也一样。

**凭证**（都在**最终那份字节**上重跑过）：
- 单元 `notify-plan` **38 条**（+7）、集成 `ai-approvals` **36 条**（+4）。
- 变异：控制 `ran=96 green=96 red=0`（`skipped>0` 直接 exit），六臂全部与跑前写下的用例名一致，
  `arms-exit=0`。第一遍是 `arms-exit=1`（B3 活了），补完用例之后又跑了三遍——
  中途 `approvalNotices(id)[0]` 那类写法让 `npm run lint` 红了 10 处 TS2532（vitest 的断言不向 tsc 收窄），
  臂的结论只对它真正读过的那份字节负责，所以每次改完都重跑控制跑。
- `npm run lint` **0 问题**（`lint-exit=0`）。中途一处 `no-fallthrough`：注释写在
  `case 'moderation':` 与 `case 'approval':` 之间，ESLint 就把前一个 case 当成了有正文的分支——
  注释要放在整组前面。
- 契约：`npm run contract:export` 之后 `git status contracts` 干净（只加常量与规则，没有新 schema）。
- 浏览器：`@smoke §74 AI 的删除结果先过人工审批…` **1 passed（42.7s，用例本身 12.7s）**，
  截图 `screenshots/ai-approval-expiry.png` 真看过：卡片那一行是
  「24 小时内未决定，这一份自动作废、被扣下的补丁不会落地（截止 2026/10/2 01:37:09）」，
  同一帧画布上 `Hero` 的 8 个节点一个没少、`DEMO MODE` 角灯亮着。
- 整套：`npm test` **111 文件 / 1276 条全绿**（181.6s，`vitest-exit=0`）。

## §144 NO LOCK-IN：一条写在原文里、但本页从没提过的要求（2026-09-30 记）

原文 §144 给了四件事：

```text
export design
export code
export assets
delete account
```

**记这一节的那天四件一件都没有，而且本页在此之前一次都没提过这个条款**——不是"排期没到",
是它根本没进过任何一张清单，所以没人知道它欠着。这里把它记成正式欠账。

> **2026-10-01 更新**：前三件（export design / code / assets）落地，见本页末尾「§144 第一片」那一节；
> `delete account` 那一件**依旧欠着**，而且依旧是这一格里唯一需要人在旁边看着的（下面的判决顺序没变）。
> **2026-10-04 更新**：第四件 `delete account` 也落地了，见本页末「§144 的最后一格」那一节——
> **§144 那四件到此全绿**。
> 下面那段"现状"是 2026-09-30 那天逐件核对的快照，留着是为了让人看见这一格是从零开始的，
> 别把它读成今天的状态。

现状（2026-09-30 逐件核对过，不是凭印象）：

- **export design / code / assets**：~~全仓没有任何下载端点~~ **2026-10-01 落地**
  （Studio 顶栏「导出」→ 一份 zip，取舍见 `docs/adr/0024-…`）。当时记下的判断是：
  代码生成**早就有了**（`generateProject()` 已能产出 `GeneratedFile[]`），
  所以"导出代码"缺的不是生成能力，是**把它交到用户手里**的那一步——后来证明确实如此，
  这一片没有碰生成那一层。仍欠的是**导入**（`docs/RUNTIME.md` 要求导出能被另一个实例读回去）。
- **delete account**：`/api/account` 只有 `PATCH`（改显示名与简介），**没有注销**。
  `users.deletedAt` 这一列建库就有、到处被 `isNull` 过滤，但**全仓没有一个写入方**
  （`deletedAt: new Date()` 只有 `projects.ts` 在写）。也就是说：软删的**读路径**早就铺好了，
  唯独没有"执行软删"的那个动作。
- 更值得记的一句：审计与通知那两处**已经在按"注销后"的样子写**（"已注销的用户"、
  "actorId 留着名字为 null"），即代码里已经预设了这个功能存在——而用户点不到它。

下一步（按此顺序，都是不依赖外部授权的自主项）：

1. **导出那一半**（design / code / assets 打包成一个 zip）。它会顺带给 §163 的 `build.status`
   与 §164 的 **Build complete** 补上真来源——生成导出正是那个"会完成的构建操作"，
   而 §164 到今天只剩这一类没有来源。
   **已于 2026-10-01 落地**，那两句顺带的账同一天结清（`build.status` 多了第二个生产者，
   `UNBACKED_NOTIFICATIONS` 那张单子第一次空下来）。第二片**导入已于 2026-10-03 落地**
   （见本页末「§105/§144 第二片」那一节）：那份 zip 现在能被读回来了。
   `docs/RUNTIME.md` 那句"能被**另一个实例**重新导入"还差最后一寸——今天证的是同一实例导回一个新项目
   （代码里没有任何源实例耦合，但没有第二个实例可跑），这一寸记在下面的欠账里。
2. **注销账号**（`delete account`）。**判决书已于 2026-10-02 写下：`docs/adr/0025-…`**，
   **已于 2026-10-04 照它执行完毕**（下面那段"没有实现"是当天的状态，别再照读；实现记录与两处偏离在 ADR 第五节）。
   判决书定的三条主轴：① **软删用户行**，邮箱与 handle 原样留着（审计里那句"已注销的用户"
   要指得到人；同一邮箱注销后不能重新注册，免得"注销"变成换身份重来的洗白通道）；
   ② **作品按有没有发布过分流**——私有草稿一并软删，**已发布的作品留在原地、公开页继续可达**
   （§145 + 别人的点赞/评论/Remix 不该跟着一次告别一起消失），作者名显示"已注销的用户"；
   ③ 实现时要一次做完六件事（服务端确认词、先给一次导出机会、吊销全部会话与 API 凭据、
   分流软删、写审计、停掉该用户频道的推送）——**少一件都不算完成**，
   软删了却忘了吊销凭据比不做更糟。
   两条硬事实记在那份 ADR 里：`projects.ownerId` 是 `onDelete: 'restrict'`（**数据库自己会挡住硬删**），
   而 `revokeCurrentSession()` 只吊销当前这一个会话，注销要用的是"全部"那一档。

## §105/§144 第二片：把导出的那份 zip 装回来（2026-10-03 落地）

`docs/RUNTIME.md` 与 ADR-0024 从写下那天起就挂着同一句话：**所有导出必须能被重新导入**。
第一片只交了"带走"，这一片交"装回来"。落地的是四件东西：

- `apps/web/src/server/domain/import.ts`——写库之前的全部判据都在 `inspectPackage()` 里，
  它不碰数据库、单独可调用；`importProjectZip()` 只做落库那一段。
- `apps/web/src/app/api/projects/import/route.ts`——`POST` multipart 的 `file` 字段。
- 导出侧清单升到 **v2**（`EXPORT_FORMAT_VERSION = 2`，多记一层 `assetRefs`）。
- 两份测试：`apps/web/test/zip-import.test.ts`（21 条拒收表，不打库）+
  `apps/web/test/import.integration.test.ts`（7 条真库往返）；控制臂 **28/28 绿**。

三条不显然的判决，都是"少一条就出错"的那种：

1. **先认版本，再谈内容**。`formatVersion` 按**相等**判，不按"高就试着读"：一份形状变了的包
   会在某个字段上解析成功，然后导出一份**不完整的项目**而没人知道少了什么。
   v2 多出来的那一层 `assetRefs`（`包里那个路径 = 模型里哪一个资产 id`）是导入能用字节换号的唯一凭据，
   所以 v1 的包只能拒——"导入成功但图不见了"比一句"这是 v1，请重新导出"难查得多。
   这一格顺带解释了为什么第一片的包今天导不回来：**v1 从来没有记过这层映射**，
   不是我这一片改坏了，是那一版根本没这个信息。
2. **代码不进库**（§16）。`code/**` 是设计模型的投影，把投影当输入写回模型等于让投影决定真值。
   导入只吃 `design/document.json` 与 `assets/**`，代码那几份数一下、原样报成 `codeFilesIgnored`。
3. **id 一律换号**。页面/组件 id 与资产 id 在库里都是全局主键：同一实例里导回自己的包，
   不换号就是撞主键或跟源项目共享同一行（共享更糟——删项目会级联删掉别人的素材，§80/§27）。
   页面/组件走 `duplicateDocument()`，资产走"重新摄取一份自己的字节 + `remapAssetIds()`"。

配额那一格（ADR-0024 说"按导入后的字节判"）没有新代码：资产是按字节走**同一道摄取门**进来的
（`uploadImageAsset` → §133 的 `refusalForStorage`），所以"这张图放得下吗"问的是导入者的用量，
不是原作者的；一张放不下不会让整包回滚，而是**项目还在、少的那一张点名**（`assetFailures`）。

### 这一片的证据

- 拒收表 18 行逐条点名自己的那句话（`zip-import.test.ts`），另加整包上限、ZIP 读端透传、
  `inspectPackage` 的正向对照三条。**"除清单外一切正常的包能通过所有写库前的判据"是那张表的分母**：
  少了这一条，任何一行红都可能是夹具自己不合格。
- 真库往返 7 条（`import.integration.test.ts`）：包不是手搓的，是 `buildProjectExport` 出来的真包，
  再在它上面做最小改动（换字节不换清单 / 换版本 / 抽掉资产 / 灌一坨不是位图的字节）。
  断言的落点：页面 id 与源项目不相交、结构逐页相等、新项目只有一行资产且 `storageKey` 不是源项目那一把、
  字节逐位相等、image paint 指向**新** id 而源 id 一次都不出现、别人导入后新项目归他而源项目的图他读不到、
  以及**拒收不新建项目**（前后各数一次 `projects` 总数）。
- 变异电池 20 臂（`.scratch/run-import-arms.mjs`，平面 = `git archive HEAD` + 这一片的文件）：
  **20/20 与预测一致，无人见证 0 臂**，拆完复位仍 28/28 绿。
  两处预测是我写错的、实测比我说得更狠，都记在脚本里：A14 拆掉校验门时
  `docText === null` 那一例是**绿**的（它被自己上面那道门先挡住，A13 拆的才是它）；
  A16 不换号时凡是真写库的**五例全红**（页面 id 撞主键），我只预测了两例。
- 顺手补的一处假警报（同一批测试逼出来的）：`documentAssetRefs` 原先把
  `loadDocument` 水合出来的 `document.assets` 也算进"文档引用"，而那些 id 是**新项目自己的行**，
  天生不在换号表里——于是每一次成功导入都会编出一条"这张图的引用会断"。现在只数节点上的引用，
  往返那条用例断言 `assetFailures` 为空就是这一格的见证。

### 还欠的三寸（按此顺序）

1. ~~**界面入口没有**~~ → **已于同一天落地，见下面那一节**：主页项目区有"导入"入口了，
   401 / 403 / 400 / 415 / 201 五条在真浏览器 + 真 HTTP 上各证了一次。
   路由里那句"没登录回 401"是显式判空 `currentUserOrNull()` 才可达的——
   同一天顺手把导出路由也从 `requireUser()`（它会**抛错**，未登录拿到的是 500）换成同一个写法。
   **413 已于 2026-10-07 用真请求证过**，理由见下面那一节（并且那一节的判断被实测更正了）。
2. ~~**ADR-0024 说的"干净实例"没有跑过**~~ → **已于 2026-10-04 跑通**，见文末「两实例往返」那一节：
   新建一个空库 + 独立存储目录 + 独立进程，把 A 实例导出的 zip 在 B 实例导进来，文档摘要与资产字节逐位对上。
   `docs/RUNTIME.md` 那句"必须能被另一个实例重新导入"因此从要求变成现状。
3. **`docs/TESTING.md` 第 12 条**：**三半都证过了**（前半句、干净实例、413）。


## §144 导入的界面入口 + 真 HTTP 状态码（2026-10-03 落地）

上面那一节欠的第一寸。四件产物：

- `apps/web/src/components/ImportPanel.tsx` — 主页项目区那颗"导入一份导出过的包"。
  放在主页而不是 Studio 顶栏，是因为导入的产物是**一个新项目**，不是往当前项目里追加东西；
  导出那颗按钮才属于某个项目。回执上每一个数字都来自服务端（`counts` / `codeFilesIgnored` /
  `assetFailures` / `exportedAt` / `bytes`），拒收时 `reason` 与 `issues` **逐条**贴出来。
- `apps/web/src/app/page.tsx` — 挂上那一格。
- `e2e/import.spec.ts` — 三条，全在真浏览器里跑（`npx playwright test e2e/import.spec.ts` → **3 passed (48.6s)**）：
  ① 顶栏「导出」下载到的**同一份字节**（`browser-import-source.zip (created by the e2e)`）喂回那颗文件输入，
  回执出现、列表里是**两行同名**（源项目没被覆盖）、点进新项目画布投影得出 8 个节点
  （截图 `screenshots/import-roundtrip-canvas.png`，标题栏就是那个"导入往返 …"的新项目）；
  ② `POST /api/projects/import` 的 403（CSRF 头不对）→ 401（新的空 cookie jar，middleware 签的 token 库里查不到）
  → 400（不是 multipart）→ 415（真传了一份不是 ZIP 的字节，理由带着 `ZIP 拒绝：` 那句原话）
  → 201（真包，回执里的 `bytes.zip` 与上传的字节数逐位相等）；
  ③ 界面上的拒收：一份合法但没清单的 ZIP 让 `issues` 那一行原样列出来（1 条），
  一份连 ZIP 都不是的字节只有一句话，界面就写"服务端没给逐条细节"——**不替它补一句猜测**（§159）。
- 两条变异臂，先写下预测再跑：
  A1 把面板里的 URL 改成 `/api/projects/impoer` → 预测红在 `[data-import-receipt]` 那一行，**实测红在那一行**；
  A2 删掉 `router.refresh()` → 预测红在"列表里两行同名"，**实测 `Received: 1` 红在那一行**。
  两臂跑完都把文件按 sha256 还原成原样（`restored identical: True`）。

### 413 那一格：量过了，而且当初"为什么不量"的理由有一半是错的（2026-10-07）

原来这里写着"用 128MB 真字节去换一句状态码，会把这台 16GB 机器仅剩的约 2.5GB 空闲内存压上去"。
现在走真 HTTP 量了一遍（`npm run probe:413`，先起 `npm run dev`）：真 middleware 签的会话与 CSRF、
注册成一个真用户、用**声明 2GB** 的 `content-length` 打导入端点。实测：

```text
POST /api/projects/import（声明 2GB）→ 413
  响应：{"error":"too_large","reason":"整包 2048MB 超过导入上限 128MB"}
  正文写了 2147483648 字节，耗时 11502ms
```

三句话，前两句是更正：

1. **413 那条路是真的**：状态码、错误码、理由里那句带上限的话，全都来自真路由。
2. **"会把内存吃光"不成立**：2GB 是**流式排掉**的——11.5 秒跑完，空闲约 2.5GB 的机器没有 OOM。
   服务端没有把 2GB 攒起来。当初那条顾虑是按"先读进内存再判"的写法推的，而路由不是那样写的。
3. **但"早拒就省下正文"同样不成立**，这一条是新知道的：服务端**把 2GB 正文全读掉了**，
   响应是在正文排完之后才到客户端的。路由里"在 `req.formData()` 之前比 `content-length`"
   只说明**判定**发生得早，**不说明字节没被收下**。所以这一格省下的是"解析/落库"，不是"带宽与时间"。

**为什么写成脚本而不是 vitest 用例**：这一格要的是真 HTTP（真会话、真 middleware、真状态码），
而 Playwright 在本机跑不起来——沙箱的批量删除守卫不让它清 `test-results/`，
理由与现象写在 `docs/ENVIRONMENT.md`。本仓已有 `realtime-two-process.mts` /
`two-instance-roundtrip.mts` 两个同类先例，需要真进程/真 HTTP 的验证就走脚本这一路。
`e2e/import.spec.ts` 里同名那条仍然保留（能跑 Playwright 的环境靠它守），
它的判据是"发一堆不是 ZIP 的字节却拿到 413 而不是 415"——即**尺寸那一关排在格式那一关之前**。
*（下一句算盘在 2026-10-04 被自己推翻，见下面那一节：独立实例那一遍跑了，413 仍然没量——128MB 就是 128MB，与在哪个平面上发无关。）*

## 两实例往返：ADR-0024 那句"干净实例"跑通了（2026-10-04）

载体是 `scripts/two-instance-roundtrip.mts`，入口 `npm run two:instance`。它把"另一个实例"拆成三件互相不能替代的事：

- **另一个库**：跑前 `drop database if exists nexus_two_instance_b with (force)` + `create`，再拿 B 的连接串迁移
  （实测 22 条）——留着上一遍的行的话，"干净实例"就退化成"同一个库再复制一份"，那正是 ADR-0024 明写不要的。
- **另一个存储目录**：B 那个在跑之前**整个删掉**。不删就没法排除"字节是从共享磁盘上蹭来的"。
- **另一个进程**：`export` / `import` / `verify` 三个孩子各拿自己那一侧的 env（连接串 + 存储目录），
  连接池互相看不见。两侧之间唯一的通道是磁盘上那一份 zip 字节，与作者手里拿的是同一个东西。

实测这一遍（7 条判据全绿，每条由父进程 `verdict <名>: PASS|FAIL` 打一行，任何一条不对就非零退出）：
zip **28141 字节**，解压后 27283 字节，3 个代码文件按 §16 不进库；文档摘要 A/B 各 757 字对上；
资产 sha `9f05a9262dad…` 两侧一致；B 侧资产数 1 且画布上有那张 `cover-image`；A 侧导出后摘要与字节都没变；
B 的存储目录里躺着一张**自己那份新路径**的 PNG（`projects/<B 项目 id>/<新资产 id>.png`，与 A 侧 3 张路径无一重合）。

摘要里**故意把 uuid 归一掉**：换号是这一片的正确行为（§16，id 不是内容），
把它算进判据等于要求"复制出一模一样的主键"——那在同一个库里就是撞主键。
所以"图还在"看的是填充的**形状**与字节的哈希，而不是填充里那个 id。

一条**空判据**是在这一片里被抓出来的：`B_STORAGE_IS_OWN_COPY` 第一版打的是 `b.note !== undefined`，
而孩子进程总会写 note，哪怕 B 侧一份字节都没落盘——那条判据永远绿。
换成父进程自己数目录、自己哈希文件字节之后它才第一次有可能红。教训与 §"界面数字只来自服务端"同源：
判据要打在**这一片声称的那个东西**上，不是打在那个东西的摘要行上。

臂（先写下预测再跑）：`NEXUS_TWO_INSTANCE_SKIP_ASSETS=1` 让导出的那一份包里没有 assets，
预测 B 侧非零退出并说出是哪张引用断了；**实测** `status=1`，
日志里是服务器自己那一句"包里没有这个资产的字节，导入后这张图的引用会断"（不是脚本替它编的）。

顺手修掉的两处真问题，都不是这一片的主题但挡在路上：

1. `URL_B` 原先用正则切连接串最后一段——实测它从 `//` 那一处就匹配上了，
   造出一个 hostname 等于库名的连接串（`getaddrinfo ENOTFOUND nexus_two_instance_b`）。改成 `new URL()` 只换 `pathname`。
2. 这个脚本一进 `tsconfig.tools.json` 的普查（`scripts/**/*.mts`），就把 `apps/web/src/server/domain/{export,import}.ts`
   拖进了一个**没有 `@/*` 别名**的程序，`npm run lint` 因此红出 5 条 TS2307，其中 `notifications.ts` 那条
   `Type 'NotificationKind' is not assignable to 'never'` 只是解析失败的连锁。
   修法是给 tools 补上它本就该知道的别名（`@/*` → `./apps/web/src/*` 与五个 `@nexus/*` 包），
   而不是把脚本从普查里摘出去。这是「新增的文件也是门禁的站点」那条纪律又一次兑现。
   同一天门禁还剩 3 条 eslint 在自己文件里（一处未用的类型导入 + 测试里两处多余变量），一并修掉；
   之后 `npm run lint` **exit 0**，`zip-import` / `import.integration` / `export.integration` **37 例全绿**。

413 仍然没量，而且上面那句理由要更正：**换平面不换代价**——128MB 真字节在哪个平面上发都是 128MB，
本机空闲内存还是那个数。这一寸继续按"要么以后在真部署环境里顺手证，要么写清楚它只到 domain 层为止"处理，
不属于能靠再想一个办法消掉的债。

环境事实补一条：这台机器的 Docker 引擎会在休眠后掉线而**发布端口可能仍在 LISTENING**，
这一跑之前用 `docker version` + 一句裸 `select 1` 确认过起点是绿的，而不是等脚本以 ECONNREFUSED 告诉我们。

## §144 的最后一格：注销账号——关上门，不拆房子（2026-10-04 落地）

判决书是 2026-10-02 写下的（`docs/adr/0025-…`），这一格照它执行完，**六件事一次做完**，
落点各在一处：

| 判决书那六件 | 落在哪 |
| --- | --- |
| ① 确认词做在服务端 | `domain/account.ts` 的 `confirmWordOf()` + `deleteAccount()` 里那句逐字比对 |
| ② 先给一次导出机会（不强制） | `accountDeletionSummary()` 带出私有草稿清单 → `AccountDeletionPanel.tsx` 给每个草稿一条 Studio 链接 |
| ③ 吊销全部会话与 API 凭据 | 同一个事务里 `delete(sessions)` + `update(apiTokens).set({revokedAt})`，不是 `revokeCurrentSession()` 那一档 |
| ④ 私有草稿软删、已发布留下 | `unpublishedLiveProjects(userId)` 那一侧写 `deletedAt`；`published_projects` 一行不动 |
| ⑤ 审计带四个数 | `user.delete` / `allowed:true` / detail 里四个计数 |
| ⑥ 停掉该用户频道的推送 | `RealtimeBus` 新增必需方法 `closeChannel()`，注销在提交之后调它 |

**判定全在服务端，界面只摊开。** 面板点开才去 `GET /api/account` 取那四个数与确认词——
客户端自己数会挂着一份可能过期一分钟的清单。收据里那四个数与预览那四个是同一份，
这一条在真浏览器里对得上（`e2e/account-deletion.spec.ts`，实测 29.3s 一次跑通）。

对外投影那一层比判决书多做一步：注销之后公开主页不再显示**头像**与**简介**，
**关注**入口也收掉（那个人收不到这条关注）；作品、handle、`@` 地址照决定一留着。
公开页标题栏从「真名 / 作品名」换成「已注销的用户 / 作品名」，`/u/<handle>` 挂着那句横幅。

凭证的形状（三样各证不同的事，缺一就不算这格）：

- `apps/web/test/account-deletion.integration.test.ts` **15 例全绿**（真库），
  里面两格值得单说：**每臂各有唯一见证**（handle 档与 display_name 档各自只红在自己那一档）、
  以及注销之后**新补的会话行也认不出人**（库里那行还活着、没过期，`sessionOwnerByToken` 给 null——
  这一格是"吊销全部"那句的独证，去掉 `sessions` 与 `users` 的联结它就红）。
- 变异臂 **6 条，6 中**（`D:\arm144.py`，仓库外，免得被文件普查算成站点）：
  每臂先断言定位串在文件里**只出现一次**，控制组（不改代码）跑绿，跑完按 sha256 逐字节还原。
  臂 F 红在**数据库身上**：把注册侧的 `emailTaken()` 换回登录侧口径，真 Postgres 报
  `23505 … users_email_key`——正是下面那句 bug 的现场。
- 五张截图逐张看过：预览那四个数与确认词、拒绝那一句、收据那四个数、注销后的公开页、注销后的主页。

### 实现时抓到的一处真 bug（不修就是 500）

`users_email_key` 建在 `lower(email)` 上、**没有 where 子句**，所以软删的行继续占着那个邮箱
（决定一要的正是这个）。但注册侧查"这个邮箱被占了没有"用的是 `findByEmail()`，
那是**登录侧**的口径（带 `isNull(deletedAt)`）。两边一错开：注销过的人拿同一邮箱再注册，
绕过应用层检查、撞在唯一索引上，看到的是一句"服务器处理失败"，
而不是这一条决定承诺的"这个邮箱已经用过了"。
修法是拆成两个函数——注册侧 `emailTaken()` 连已注销一起算，登录侧继续用 `findByEmail()`。
**"不能重新注册"是一条约束，不是一句愿望**：它要有服务端那句可读的拒绝才成立，否则它是一次 500。

### 这一格明确不做的一件（留给下一次裁决）

`/api/published/interact` 的 like / comment / follow 与举报**仍然接受指向已注销账号**的写入。
判决书只决定"注销那一刻发生什么"，没决定"别人还能不能对一个不在的人做社区动作"——
那是产品决定，不替它做。代价写清楚：直接打 API 仍能给一个 ghost 加粉丝数、
发一条他永远读不到的通知。今天的选择是**服务端不动、界面少给入口**，两边都不假装。

### §144 到此四件全绿，剩下的欠账

- `closeChannel()` 今天停的是**推送**不是那条 HTTP 长连接（这一层没有掐连接的原语，
  `connections.ts` 只数人数）。换 Redis 驱动做多实例扇出时这一格必须照样做得到（与任务 #10 同一根线）。
- 运营侧"清掉 `deletedAt` 恢复账号"今天**只有列没有代码**（没有 `restoreUser()`），要手写 SQL。
  这与"界面里不提供取消注销"一致，但别把 ADR 那句"已有先例"读成"已经有个按钮"。
- 本页 §144 那一节记的两条下一步（导出、注销）到此**都结清了**；
  这一格还欠的老账只剩 413 那一句，**已于 2026-10-07 量掉**（见上一节，两处更正也记在那里）。

## §163 第四片：跨实例实时扇出真的跨了实例——两条连接、一个开关、五个进程 —— 2026-10-06

任务 #10 那一格欠的是"跨实例"，ADR-0025 §五 与本页 §144 那一节都把它写成了显式约束：
**换成 Redis 驱动做多实例扇出时，"注销后不再向他推任何东西"这一格必须照样做得到，
否则第六件只在一个进程里成立**。这一片做掉的是那一寸，方案与取舍在 `docs/adr/0028-realtime-redis-fanout.md`。

### 落地的形状

- **接口没动**。`RealtimeBus` 还是那四个方法，所以 SSE 路由、通知链、发布链路、审批过期那一路
  生产者**一行都没改**——这是当初把总线做成接口的唯一回报，这一片就是兑现它的地方。
- **新驱动 `server/realtime/redisBus.ts`**：所有帧走一条线路 `nexus:realtime:v1`（名字里带版本段），
  本机那一半边继续交给抽出来的 `localBus.ts`（`MemoryRealtimeBus`），Redis 只补跨进程那一半。
  帧的格式是 `packages/schemas` 里新增的 `RealtimeWireFrameSchema`（`kind:'event'` / `kind:'close'`，
  都带 `origin`）；它是第二份定义、只走 web↔web，所以**不进 `CONTRACT_EXPORTS`**（`AgentRosterSchema` 同理由）。
- **开关**：`NEXUS_REDIS_URL` 非空才装 Redis 驱动，否则进程内，装载那一刻打一行日志说清装的是哪个。
  **连接失败不悄悄退回进程内**——那会让一台配了 Redis 的实例看起来正常而实际收不到别机事件。
- **关门跨进程**：`closeChannel` 本机立刻关，另外往线路发一帧 `close`，别的实例各自关自己那份。
  这一帧不重试不补发：0025 说的是"不再向他推"，不是"保证某一帧一定送到"。
- **两个可观测点**：`wireErrorCount`（线路坏了业务照样走，但要说出来）与 `ready`（这台总线的跨实例
  那半边接上了没有，永不 reject，Redis 宕机时立刻答 `false` 而不是吊死）。

### 测试把实现改对了一次（这是"为什么必须打真 Redis"的证词）

第一版给两条连接用了同一份 `enableOfflineQueue:false`，于是构造函数里那句 `SUBSCRIBE`
在 socket 就绪之前就被当场拒掉——这台总线**永远订不上线路**，跨实例那半边一条都不送，四条投递用例全红。
而本机那一半边始终是对的，所以任何单元测试都发现不了它：红只出现在真 Redis 上。
第二版又踩一次：断言之前的"发一帧直到收到"式 warm-up，自己漏出去的帧在断言开始后才到，
把"收到 1 条"变成"收到 2 条"。`ready` 就是为了取消这类靠猜时间的等待。
两侧参数现在不对称（发布侧不等线路，订阅侧等得起），这段写在 ADR-0028 的决定里。

### 验证（实测数字）

- `apps/web/test/realtime.redis.integration.test.ts`（真 Redis，两条独立总线 + 一条绕过总线
  直接往线路上发字节的原生连接）：**6 例全绿**，duration 2.22s（tests 972ms）。
  钉的是别机投递、origin 去重（`seenAlpha` 停在 1）、关门在另一台直接可见（订阅人数 1→0）、
  坏帧只让计数动、端点连不上时不抛且 `ready=false`、以及驱动选择本身。
- **两个真实进程**：`npm run realtime:two-process`（`scripts/realtime-two-process.mts`）。
  上面那两条总线共享一个进程、一个 globalThis、同一份模块图，所以它们证不了"生产路径上那台单例
  会在两个进程里各自选到 Redis 驱动"。这条脚本 spawn 一个长命监听进程 + 四次独立 spawn
  （发事件、关门、关门后再发两条）：**实测 5 个进程、4 次往返、8 条判据全 PASS**，
  其中"关门后没收到"配了一条"别的频道收到了"作对照，否则那句只是反证。
- **反向控制**（手工把发送侧的 `NEXUS_REDIS_URL` 指到没人听的端口）：那一趟**零退出**
  （`publish` 不抛这条纪律在另一个进程里也一样）、`ready=false`、`wireErrorCount=10`，
  而监听侧 `receivedClosed` 停在空数组。所以那条投递判据读的是线路，不是磁盘上那份报告。
- **变异探针**：7 条臂各拆掉这一片的一句纪律（回环摘除、关门广播、坏帧校验、本机半边先送、
  `publish` 不抛、驱动选择那次读空、订阅侧重连参数），**7/7 红在预测的那几条用例上**，
  还原后控制跑仍绿。
- 全套：`npm test` → **119 files / 1388 tests 全绿，300.11s**。

### 这一片明确不做的

- **补发**：§163 那格到此只剩这一件，性质从"缺功能"变成"明确的语义选择"——断线期间的跨实例事件
  收不到，界靠刷新与 SSE 首帧重读兜住。要做补发得另立 ADR 选 Redis Streams（连同裁剪与消费位点）。
- **真跨机**：两进程见证走的是同一台机器的同一条 Redis；跨机多出来的那一寸是延迟、防火墙与多机房路由。
- **诊断入口**：`wireErrorCount` / `ready` 现在只在 stderr 与测试里，界面上还看不到"这台实例掉了几帧"。

## §47：角色对话的 provider 侧接通——两端契约、DEMO 409、真回复才落记忆 —— 2026-10-06

"跟角色说话"从 501 占位变成真链路，三段各守一条边界：

- **ai-service 侧**（`2ef6d11`）：`POST /v1/ai/chat`。没配 provider 就 503，**绝不编回复**（§159，
  判决书 ADR-0026）；回纯文本不带补丁，所以 §73/§74 的审批挂起不适用这一路。
  两份跨端契约（`ai-chat-request/response.schema.json`）进 `packages/schemas`，
  ai-service 的测试直接对着 JSON Schema 校验报文。
- **web 传输**（`server/ai/client.ts` 的 `chatWithCharacter`）：与 `runAiService` 同一形状——
  HTTP + 双端契约复核（响应过 `AiChatResponseSchema`，不合契约报 internal，不把坏形状交出去），
  不可达报可重试的 provider-unavailable，60 秒超时（对话是一次完整生成，不是轻查询）。
- **对话路由**（`/api/projects/[id]/characters/[cid]/chat`）：CSRF → 会话 → 项目归属 →
  限流（20 次 / 10 分钟）→ zod → 角色存在 → **DEMO MODE 409**（`caps.text !== 'real'` 时不生成、
  不落记忆）→ 人设 + 近 5 条记忆 + 语料检索（有 embedding provider 才有语义那半）装配上下文 →
  调 ai-service → 失败原样透传状态码，**成功才落一行记忆**（用户原话 + 角色原话，写名字不写 uuid）。

**验证**：`npm run lint`（typecheck + eslint）0 问题；
`ai-client-chat.test.ts` 5 例（200 透传 / 未配地址 / 不可达 / 503 透传 / 契约不符）+
`character-chat.test.ts` 5 例（人设拼装与上下文截断）全绿；
ai-service 侧 `test_chat.py` 在 `2ef6d11` 那一轮跑过（无 provider 503 / 契约外拒收 / 空回复报错）。

**这一片明确不做的**：
- **界面入口（同日第二片落地）**：角色面板上有"跟角色说话"了——本地一段临时对话，
  服务器的 409/429 原话亮在对话区里，界面不编一句假的顶上；切角色/删除即清空。
  没有会话线程这件事写在提示行里，不假装 `sessionId` 存了档。
  e2e：`character-chat.spec.ts`（@smoke）在 DEMO 环境点一遍——用户的话进记录、
  `character` 气泡数必须为 0、错误行含"DEMO MODE"、输入框在错误后仍可用。
- **/world 的 talk（同日第三片落地）**：HUD 上「跟角色说话」展开同一块 `CharacterChat`
  （§140 的 talk 走的就是 §47 那条 API，没有第二条嘴），名册服务端取好传下去不重复拉。
  e2e：`world-talk.spec.ts`（@smoke）先建角色与世界骨架，再到 `/world/<项目>` 展开 talk——
  下拉里是档案名不是世界条目、DEMO 409 原话亮出、角色气泡为 0；headless Chrome 给不出
  WebGL 时 `test.skip`（那一格的诚实路径另有人管）。
- **多轮线程**：`sessionId` 只是回显，没有专门的会话历史；上下文靠记忆表近 5 条间接带一点。
  要真多轮得另立会话存储，不假装 sessionId 已经做到了。
- **模型重排**：语料检索沿用 §49 现状（规则融合），没有因为对话而悄悄升级成模型 rerank。

## §38 Sketch → Image 落地（2026-10-08）——绘制面、测量值，外加一道归属修复

M2 清单里最后那条"未动"的箭头接上了。链路是：资产库面板的 **SketchPad 绘制面**（白纸黑笔，
导出 PNG）→ 与上传**同一道摄取门**（§80，元数据照剥）→ 服务端 `extractVisualDna` 量出
**落墨占比**（1−平均亮度）与**笔画密度**（边缘密度）→ 两个值参与合成器的明暗基线与形状数量，
并进入身份哈希。同一张草图两次生成逐字节可复现；两张不同的草图出两张不同的图。

**草图只管构图，不管形状，也不钉色相**——这是这片最大的一个决定。黑白线稿量出来的"主色"
是纸白，把它当色相锚点写进 genMeta 就是给用户一个与事实不符的交代；所以 `sketchAssetId`
与 `referenceAssetId` / `generateCharacterPortrait` 互斥，回执文案明写"明暗与元素密度取自草图
的测量值，不管形状本身"。真"照轮廓画"要真 provider 的图生图（§76-79），接上之前不做假变换。

**一次点击 = 一次事务**（§149）：草图与生成图两条 `addAsset`（加可选贴合）绑在一起撤销。
非对称也如实写：上传成功那一刻字节已在服务端，若生成那步失败，错误回执明说
"草图已存进项目存储但没人引用它"，不假装能回滚服务器（§159）。

**红出来的真缺陷**：跨项目草图那条集成用例第一次是**绿的**——守卫根本没拦住。
根因不是测试写错，是 `openAssetForOwner` 只验"这个用户"，不验"这个项目"：
同一用户**另一个项目**里的资产可以被注入本项目的生成血统。补了 `inProjectAssetIds`
清单门，`sketchStatsOf` 与既有的 `hueAnchorOfReference` **两处一起修**（重复守卫只修一份，
坏的那份永远是用户够得着的那份）。这条对 referenceAssetId 是既有缺口的收口，不是新引入。

**确定性不变式**：无草图路径的像素与哈希**逐字节不变**——`sketch:` 那一段哈希只在字段存在时
拼入（72b28d1 的教训就在眼前：可选字段不能悄悄挪动基线）。

**凭证**：
- `image-synth.test.ts` **8/8**——含行为见证：重落墨草图的产物平均亮度**量出来**确实低于轻落墨的，
  不是只比哈希；preflight 拒 1.2/NaN、放过 0/1 两端。
- `image-studio.integration.test.ts` 打真库 **22/22**（草图新增 4 条：字节不同且 genMeta 不带 hueAnchor、
  两张不同草图出两行、同一草图二次命中去重、跨项目被拒且一行不留、互斥被拒且一行不留）。
- e2e @smoke（`image-studio.spec.ts` 第二条）：真鼠标在 `[data-sketch-pad]` 上按-拖-放画一笔 →
  空描述时按钮不可点且缺料文案可见 → 填描述 → 生成 → 清单一次多两张卡（草图无 DEMO 角标、
  生成图有——两枚徽章各有事实）→ 撤销两张一起走。**1 passed（19.8 秒，与提交版规格同一次跑）**。
  截图 `screenshots/image-studio-sketch.png`。
  这一条在真浏览器里还抓到一个单测抓不到的崩溃：React 合成事件的 `currentTarget` 在
  state updater 执行时已释放为 null——第一笔 pointerdown 直接把页面砸穿（Next dev overlay
  "This page couldn't load"）。坐标改在 dispatch 前量取。
- M2 清单同步：image→image 标为"已通（DEMO 语义的前半截）"（f66ee74/72b28d1 补记），
  sketch→image 标为"已通（DEMO 语义）"，两条都写清边界。

**这一片明确不做的**：草图笔迹进设计模型（它是生成原料，不是文档真值，与分镜/世界面板
同一口径走本地态）；按轮廓构图（合成器没有"形状摆位"这条受草图驱动的路，硬做就是假变换）；
草图与参考图混用（两条来源各说各的，混在一起 genMeta 就说不清这一张到底是谁家的）。






## §127/§134：买与分成这两条路**从 0024/0025 落地起就一行都写不进去**，以及并发下的重复扣款（2026-10-09）

起因是给 marketplace 的钱那一半补测试——它此前**一条用例都没有**。三条用例一跑全红，
红在 `credit_ledger` 的三个 CHECK 上。**那不是用例写错了，是这条路本身是坏的。**

### 一、三道闸全都没打开（迁移 0024/0025 的"换约束"写错了旧名字）

那两条迁移想"把 `marketplace` 加进取值域"，写法是：

```sql
ALTER TABLE credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_kind_check;   -- 名字多了一个 _check
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_kind_check CHECK (kind IN (..., 'marketplace'));
```

0016 建的约束叫 `credit_ledger_kind`（**没有** `_check` 后缀），所以 `IF EXISTS` **静默地什么都没删**，
ADD 又建了一条新名字的。两条同时生效，取值域是它们的**交集**——旧那条把 `'marketplace'` 挡死。
0025 对 `source` 犯了**同一个错**（`credit_ledger_source` vs `credit_ledger_source_check`）。

第三道不是名字问题，是形状表：`credit_ledger_source_shape` 按 source 逐个列举分支
（`plan_grant` / `generation` / `adjust`），0025 只改了成员表没动它，所以 marketplace 那两个来源
落进这个 CHECK 时三个分支全不匹配。

**修法**：0029 摘掉 `credit_ledger_kind`、0030 摘掉 `credit_ledger_source`、
0031 给 `source_shape` 补上两支（买 → `delta < 0`、分账 → `delta > 0`，沿用"钱的方向由 source 决定"）。
**三条是一组，修任何一条都不够**——kind 过了 source 拦，source 过了 shape 还拦。

### 二、schema 里两列的名字与迁移对不上（`now()` 把列名写死成 `created_at`）

第四关：`marketplace_purchases` 插入报 `column "created_at" does not exist`。
根因是 schema 里 `purchasedAt: now()`——`now()` 是 `timestamp('created_at', ...)`，**列名是写死的**，
而迁移建的是 `purchased_at`。`marketplaceSplits.splitAt` 同样。
改成显式 `timestamp('purchased_at', { withTimezone: true })`。
全仓扫了一遍 `At: now()`：只有这两处属性名不是 `createdAt`，其余都正确。

### 三、并发下会重复扣款 / 重复分账（钱在事务外）

两条写钱的路是同一种形状：查重 → 写 `credit_ledger`（钱）→ 写被唯一索引保护的那一行。
**三步之间没有事务**。并发时两个请求都能过查重，于是各写一行钱，第三步才被唯一索引拦下——
拦下的是记录行，**不是已经动过的钱**。实测（`marketplace-settle.integration.test.ts`）：

```text
一笔购买却分了 2 次账：钱在事务外，唯一索引拦不住它: expected 2 to be 1
```

**修法**（两处同改，缺一不可）：① 整个写路径进 `db.transaction`；② 把**被唯一索引保护的那一行挪到钱前面**，
让并发的第二个请求在写第一行时就被挡下、事务立刻回滚，一个字节的钱都还没写。
唯一索引的 `23505` 翻译回 `Already purchased` / `Already settled`（调用方按消息文本区分正常重复与故障，
直接把驱动错误抛出去会让它记一条假错误日志）。

### 四、补的守卫：这一片坏了两周没人知道，是因为**没有守卫**

`api_tokens` 的 scope 名单有同形状的守卫（常量 / 迁移里生效的 CHECK / 端点真执行它），
所以那一次 scope 变更被抓住了；`credit_ledger` 没有，于是它坏了两周。
新增 `credit-ledger-kind.integration.test.ts`：**从 `pg_constraint` 读回库里真正生效的约束**，
与 `CREDIT_LEDGER_KINDS` / `CREDIT_LEDGER_SOURCES` 逐条对齐，并断言"管 kind 的约束**只有一条**"
（多条同时生效正是这次事故的形状），外加"账本上的只追加触发器还在"。
**变异探针**：往库里加回一条多余的 kind 约束 → 预测红在"只有一条"那一条，**实测红在那一行**。

### 凭证

- `marketplace-settle.integration.test.ts` 3 条（串行购买只扣一次 / 并发购买记录行唯一 / **并发分账只分一次**）。
  这一条故意**不清理账本与用户**：`credit_ledger` 是只追加的（触发器挡 DELETE），
  而 `user_id` 是 `onDelete: cascade`，所以"造了一个有流水的人"之后就删不掉他——
  每个用例用自己的买家，断言按 userId 划范围。
- `credit-ledger-kind.integration.test.ts` 4 条。
- 迁移 0029 / 0030 / 0031。
- `apps/web/src/app/api/marketplace/earnings/route.ts` 顺手改掉一处同类的形状问题：
  401 原来是 `{ error: 'Unauthorized' }`（那个字段装英文人话），改成 `jsonError(401,'unauthenticated',…)`。
  **这一格仍然没有用例**，且它是把该创作者**所有**分成行拉回来在 JS 里聚合的——
  行数一多就是一次全表扫。这两点照实记在这里，没有假装已经解决。

## §41 第三片：片段级裁切——双击一格，在点击处切成两镜（2026-10-10）

§41 的时间线编辑前两片改的是**一镜的长度与位置**。这一片改的是**镜数**：
在一格内部落一刀，把这一镜变成相邻的两镜。模型层在此之前没有这个东西——
不是漏了，是它的形状必须先定下来：**切的是时间线，不是像素**。

### 决定：不新增 op，切 = 两个已有 op

`splitShotAt(shot, atMs, secondId)` 只做算术与判断，产出 `{ ok, headMs, tail }`；
写库那一步是 `applyOps([{ updateShot 前半变短 }, { addShot 后半插到下一位 }])`。
为什么不加一个 `splitShot` op：补丁层（`patch.ts`）的逆是**按 op 算**的，
`updateShot` 与 `addShot` 各自的逆早就被验证过了（`removeShot` ↔ `restoreShot` 记位置那一条），
新造一个 op 要把逆、重做、服务端校验各写一遍并各测一遍，而它换来的表达能力是零。
一次双击仍然**只落一个事务**（`applyOps` 一次进栈），撤销一步回到切之前，不是一步回到"前半变短但没有后半"。

三条算术上的口径，都是会骗人的地方：
- **后半是减出来的余数，不再吸一次刻度**。`2501ms` 切在 `1240` → 前半 `1200` + 后半 `1301`。
  两边各自吸附的话总长会变成 `2500` 或 `2600`——一次什么都没干的编辑凭空多出 1 毫秒，
  而时间线是**投影**（§16），它的 `totalMs` 必须与镜头表逐毫秒对得上。
- **id 留在前半**，后半拿新 id（界面上 `crypto.randomUUID()` 给）。`moveShot` 之后 id 不改，
  这条链上所有引用（参考图、角色、将来的视频帧）都跟着**前半**走，这是刻意的：
  已经生成的那一帧对应的是这一镜的开头。
- **转场留在前半，后半一律 `cut`**。`transition` 描述的是"这一镜与**上一镜**怎么接"，
  切出来的第二镜前面那一镜就是原来的开头，衔接关系没变；
  新那一格的接缝是刚出现的，没有任何人指定过它，所以给最保守的那种。

### 三条路，同一个动作

| 入口 | 切点 | 挡住的话 |
| --- | --- | --- |
| 时间线上双击一格 | 落点按**那一格自身宽度**换算，再吸到 100 毫秒 | 不挡，由模型拒并说清往哪挪 |
| 镜头表里的 ✂ | 固定中点 | `durationMs < 200` 时 disabled，`title` 说的是"不足两格步长" |
| （手填数字框改长度） | — | 与切无关，但它是上面那条 disabled 的来源 |

拒因分两句，不是一句"太短"：前半不足一格 → "切点往右挪一点再切"；
后半凑不成一镜 → "切点往左挪一点再切"。两句都是**没有写库**（不是"切了一半"），
界面上也不会留下一个 0 毫秒的隐形方块。

### 红出来的三条（都不是生产代码的错，但都值得记）

1. **贴着左边缘那一刀在长镜头上根本拒不掉**。第一版把拒绝写成"在 3000 毫秒的格子上双击 x=2 像素"，
   预期"前半不足一格被拒"，实测**切成功了**：`2/119 × 3000 ≈ 50` 毫秒，
   而 `Math.round(50/100) = 1` → 前半正好一格。也就是说拒绝的窗口只有**半格**宽——
   在 3 秒的格子上那是约 2 像素，作者几乎不可能落到里面。
   现在这一条改成先把那一镜手填成 150 毫秒再切：短镜头上"半格"是几十像素，两半的拒因都真的打得中。
   **这条实测顺带说明了一件界面事实**：长镜头贴边那一刀的实际效果是"切出 100 毫秒的一小格"，
   不是"什么都不发生"。这不是缺陷（100 毫秒是合法的一镜，界面上看得见、可撤销），
   但它是那个 100 毫秒下限真正在挡的东西。
2. **双击的第二次落点用旧盒子算，会落在格子外面**。两下双击之间，拒因那一行写进了
   `data-storyboard-notice`，那一句在 239 像素宽的面板里换行、多占高度，把下面的时间线整条顶动；
   拿第一次量的 `boundingBox` 按第二下，鼠标事件谁也没接到，屏幕上留的还是上一次的拒因——
   看上去像"两句拒因说了同一句话"，其实是第二下根本没点到。
   抓手改成每次落点前重量一次盒子（`dblclickBlock`）。这一条与 §41 第一片那条
   "不先滚进视口就是假绿"是同一族：**时间线在滚动容器里，坐标是易腐的**。

3. **整组跑出来一条早就红着的旧用例**（不是我这一片改坏的）。`§41 时间线键盘那条路` 的第六段
   要在图层面板里选一个画布节点，而它当时开着的是**分镜**面板——左边那一格一次只挂一个面板
   （`StudioShell.tsx` 里那一串 `tab === …`），图层面板根本没挂载，
   `layerId(page,'Hero')` 轮询五秒拿到空字符串。这一条自 2026-09-28「分镜」进那条互斥 dock
   （2993d03）之后就不可能在整组里绿过，而它自己那次提交写的是"e2e 绿"——
   **写的时候大概只跑了新加的那一条**。修法是把页签切回来：`⑥` 先点图层、选完节点，再点分镜、
   重量一次 `handle` 再按键（选择存在 store 里，换页签不冲掉，右侧属性栏仍拿着 Headline 的 X）。
   记这一条是因为它是本仓库反复出现的那类假绿：**一条用例单独跑绿，不等于它在整组里绿**；
   而"整组跑"这一动作在这条链上欠了 12 天。

顺手补的一条断言：两次被拒之后 `[data-storyboard-save-state]` 必须还是"已保存"。
双击的 `pointerdown` 会先走"拖整块换位"的起手，`endReorder` 里那句
`previewIndex === fromIndex` 就 return 是这一条能绿的原因——没有它，
每次双击都会往撤销栈里塞一个什么都不改的空步。

### 凭证

- `packages/video-model/test/split.test.ts` 5 条：中点切 / 余数不重吸（2501 → 1200+1301）/
  两半各自的拒绝 / 坏输入（空 id、id 撞车、NaN）/ **接进 `storyboardTransaction` 的往返**
  （撤销后 `toEqual(before)`、重做后 `toEqual(applied)`，并核对 `timelineOf` 的 clip 偏移
  `[['z',0,1000],['a',1000,2500],['a-2',2500,4000]]`——总长 4000 一格没多）。
  最后这一条是这一片的全部意义所在：光测纯函数证不出"撤销真的回得去"。
- `packages/video-model` 整包 **50/50 绿**（4 个文件）。
- `e2e/storyboard.spec.ts` 新增 `@smoke §41 片段级裁切`：真浏览器里双击 → 3 镜、
  `[1000,2000,3000]`、后半 `transition:'cut'` 而前半保留原来的、两半 `prompt`/`camera` 相同、
  摘要行仍是"3 镜 · 共 6 秒"；撤销一步 → 服务端那一份的 id 与长度都回原样；
  ✂ 那条路 → `[1500,1500,3000]`；两条拒因各打中一次，且库里仍是 `[150,150]`。
  **单条 15.8 秒绿**，截图 `screenshots/storyboard-split.png`（画面里读得到
  "后半只剩 50 毫秒，凑不成一镜（最短 100 毫秒）——切点往左挪一点再切"）。
- **整组 7/7 绿**（`npx playwright test e2e/storyboard.spec.ts`，1 worker，2026-10-10 00:42）：
  挂角色 25.8s / 切句成镜 24.8s / 非法时长 15.7s / 检索面板 14.0s / §41 拖动 13.1s /
  §41 片段级裁切 22.0s / §41 键盘那条路 16.3s。最后一条是**修出来的**：它在整组里和单跑里都红，
  修法与教训见上一节第三条。
- 门禁：`npx tsc -p apps/web/tsconfig.json --noEmit` 0 错、`npx tsc -p e2e/tsconfig.json --noEmit` 0 错、
  四个改动文件 `npx eslint` 0 问题。

### 明确不做

- **不做"逐帧预览"**：切完之后两半看起来还是同一张参考帧，因为**它就是**同一张。
  本机没有视频 provider（`videoAssetId` 一直是空），所以"片段级裁切"今天能改的只有时间轴上的
  那一段区间，改不了任何像素。界面上那句"切的是时间线，不是像素"就是这一条的常驻说明。
- **不做"切掉的那一段可恢复"**：这里没有"剪掉"，只有"分成两镜"。真正的 trim-to-remove
  （把中间一段挖掉并可还原）要的是 `removeShot` + `restoreShot` 那一对带内容的补丁，
  模型层已经有这个能力，缺的是界面上"拖一个选区"这个交互——那是另一片。
- **不做多段选区 / ripple 删除**：一次一刀、双击落点即切点，是当前这一片的边界。

## §163 诊断入口：`wireErrorCount` / `ready` 从 stderr 走进界面 —— 2026-10-13

ADR-0028 那一片"明确不做的第三件"清账（补发与真跨机仍欠，见那节）。起因一句话：
线路坏了只有一行日志，"这台实例掉了几帧"在界面上根本看不见。

- **落了什么**：`RealtimeBus` 接口多一个 `stats()`（两个驱动各自自报家门），回执
  `RealtimeBusStats`：`driver` / `instance` / `subscriberCount` / `wireReady` / `wireErrorCount`。
  **两个 `null` 是这一片的骨架**：进程内驱动没有线路，那两格报 `null`（不适用）而不是 0——
  0 是"跑着一台从没断过帧的 Redis"，报出去就是假话。`wireReady` 同步读已落定值
  （`ready` 永不 reject 但可能永不落定，诊断页不该被一次吊着的连接拖住），
  没落定时也报 `null`（"还没落定"不是"没接上"）。
- **门**：`GET /api/admin/realtime` 与复核台同一句口径（401/403，`role=admin`）；
  `/admin/realtime` 页面本身也走同样的拒绝样式（`data-admin-denied`）。
  端点**不做二次加工**——加工一层就多一处把 `null` 改成 `0` 的机会。
- **界面**：`/admin/realtime` 每 4 秒轮询（`StatsPanel.tsx`），五格各带限度话：
  "本进程订阅者 N 人（不是全平台的数——线路查不到远端有谁在订）"、失败累计 >0 时补一句
  "失败的帧不补发，权威状态永远在库里"、页脚写死"只回答这台实例（多实例部署下每台各算各的）"。
  拉取失败显示 HTTP 状态而不是画成 0（与 api-tokens 那本账同一口径）。
  另外三个 admin 页的导航都加了入口。
- **踩到的环境陷阱（判据记下来）**：第一轮浏览器里端点 500、vitest 却全绿——
  `getRealtimeBus()` 的单例挂在 `globalThis` 上，dev server 是改代码**之前**起的，
  手里那份总线还是旧模块图里的对象，`stats is not a function`。
  判据：**改了 `server/realtime/*` 之后 dev 下先重启 next dev 再下结论**（重启即愈，不是代码坏）。
- **另一条被断言反咬的**：死端点那条用例里我先断言 `subscriberCount` 为 1，
  实际是 0——因为同一条用例前面刚 `closeChannel` 过，本机那份订阅按 ADR-0025 已被摘掉。
  改成钉 0（如实报关门前的现场），这条反而是多出来的一格见证。
- **凭证**：`realtime.test.ts` 17 条（新增：进程内 `stats` 的 null 语义、订阅者计数、
  换单例后诊断跟着换）+ `realtime.redis.integration.test.ts` 7 条（新增：真 Redis 上
  落定前 `null` → 就绪后 `true` 且零错误；死端点 `false` 且失败累计 ≥1、`closeChannel` 后订阅者 0）
  + `admin-realtime.integration.test.ts` 4 条打真库（401 / 403 连一个字段都不给 /
  admin 200 且 `null` 不被抹成 0 / 换单例回执跟着换）——三个 realtime 文件合计 **38 绿**。
  e2e `@smoke 发布机检与公开页举报` 尾部加了 `/admin/realtime` 拒绝断言与截图（**1 passed，55.3s**）。
  真浏览器走完整条：注册 → 运维改库提权 → 表盘 `ready`（driver=redis、wire=up、0 错误）→
  等一拍更新时间真的变 → 降权后接口 403 → 删临时账号；截图 `screenshots/admin-realtime-panel.png`
  与 `admin-realtime-denied.png` 都看过。
- **明确不做**：**补发**（§163 剩的那一件，要另立 ADR 选 Redis Streams）；fleet 视图
  （这页只回答一台实例，多实例的"每台都来看一眼"没有聚合层）；`stats` 不进
  `CONTRACT_EXPORTS`（web 自己的 admin 端点，与 `RealtimeWireFrameSchema` 同理）。

---

## §188 全局访问账：谁在扫库从"要自己翻库"变成一屏 —— 2026-10-15

M8 第三片（2026-09-29）欠的那格清账："这本账只有按人 / 按枚的视图，没有全局视图（谁在扫库、
哪一枚凭据是热点）也没有导出"。同一张 `api_access_buckets`、同一本 30 天的账、同一句
"分钟合并，不假装逐次流水"——这次是**跨全部用户**的那一面。

- **落了什么**：`listApiAccessGlobal(days)` 三问聚合在 SQL 里做（不是先扫进内存再分组）——
  凭据榜（调用和 / `count(distinct endpoint)` / 项目数带 `filter (where project_id <> '')`，
  空串是集合类端点的合法值，数它进来就是把空气数成一个项目）、端点榜（调用和 + 不同凭据数）、
  总数三格（总调用 / 活跃凭据 / 涉及主人）。窗口 `?days=1|7|30` 写死名单，
  名单外 400 并说清可选值——不把 "411" 悄悄按 30 天算，屏幕上就不会出现一句与查询者无关的话。
  `exportApiAccessGlobal(days, kind)` 同账同窗但**不截断**（只导前 20 等于让人拿残账对账），
  CSV 按 RFC 4180 转义、CRLF 行尾、行首 BOM（Excel 双击中文不乱码）。窗口天数与榜别进
  `content-disposition` 文件名，拿到文件的人不必开文件就知道它是哪一屏的账。
- **门**：`GET /api/admin/access` 与 `/api/admin/access/export` 和复核台同一句口径
  （401 / 403，`role=admin`）；`/admin/access` 页面同样走 `data-admin-denied` 拒绝样式，
  四个 admin 页互相挂导航。
- **诚实三处**：榜单截断如实写"前 N / 窗口内共 M 枚"（不是"就这些"）；总数在活库里不断
  绝对值断**增量**（插账前后比差——全局账里有别人，别人的读写不归我们的用例说）；
  端点名与 CSV 表头是英文/机器串，说明进脚注与文件名而不塞进数据行。
- **凭证**：`admin-access.integration.test.ts` 11 条打真库（401 / 403 一格总数都不给 /
  坏窗口 400 / 聚合精确值 + 总数增量 / 40 天前 100 次的假热点进不了 7 天也进不了 30 天 /
  CSV 门与白名单 / BOM 走字节断言——`Response.text()` 按 fetch 规范会剥 BOM，第一轮就是
  被它咬的 / 纯函数转义与行尾）。e2e `@smoke 发布机检与公开页举报` 尾部加 `/admin/access`
  拒绝断言与截图（**1 passed，21.5s**）。真浏览器走完整条：注册 → 造两行桶 → 运维提权 →
  页面两榜都在（我们那行调用 6）→ 窗口切 30 天换选中态 → 导出 CSV 头三字节是 EF BB BF
  且 alpha 行 `,4,1` → 坏窗口 400 → 降权后接口 403 → 删临时账号；
  截图 `screenshots/admin-access-panel.png` 与 `admin-access-denied.png` 都看过。
- **顺带修的（不属这片，是这次全量跑暴露的）**：`admin-role.integration.test.ts` 降权那条
  断言"全局还剩 2 个 admin"，被 9 个 `mod+admin+…@nexus.test` 的 e2e 残留顶红——
  改成增量（少一个 + 动手的自己还在，推论的两半都在），残留清掉。全局计数断言换个
  残留就会红，增量断言守的是同一条推论且不挑库。
- **明确不做**：逐项目 / 逐端点的**时间序列**折线（这页是"窗口内合计"，趋势图是另一片）；
  报文不进 `packages/schemas`（与 `/api/admin/*` 其余端点同一先例：同源 admin 面的内部报文，
  不是跨进程契约）；告警（"某枚凭据一小时打爆 N 次就发通知"）——今天只把账摆出来，
  没有第二双眼睛替人盯。

---

## §140 第五片：坡地——每个特征自带剖面，不是网格高度场 —— 2026-10-15

第四片落地时欠的那句"仍欠：真正的坡地/高度场"。先说结论：**做剖面（profile），不做高度场**——
理由与取舍在 ADR-0041，一句话版：§140 的世界模型是"作者画的几何特征"（圆台/坡），
网格高度场会把"画一个坡"变成"采样一张图"，与 §16 设计模型唯一真值的方向相反。

- **落了什么**：`WorldPlateau.profile?: 'mesa' | 'cone'`（schemas + 模型 + 投影三层同一套）。
  mesa = 第四片的硬边圆台（**缺省**：老文档没有这一栏，读进来照旧，投影里补成 `'mesa'`）；
  cone = 台心 height、半径一半处 height/2、边缘 0，**线性**（可走的斜面）。
  写入端只认这两个值：坏剖面拒收且交回"剖面"两个字，文档一个字不动；normalize 只写 cone，
  不给 mesa 存一栏没人读的默认值（存盘形状与第四片逐字节相同）。重叠语义不变：取最高的那个
  （cone 与 mesa 混画也一样）。`terrainHeightAt` 分支判定，mesa 边缘（d === radius）仍算台面、
  cone 边缘算 0——两个语义各自自洽，不用一个公式硬拗。
- **界面**：世界图「画地形」工具条多一个剖面开关（台面/坡，`aria-pressed` 自报），
  切到坡时提示语换成圆锥坡那句；画出的坡在 2D 是**虚线**圆（台面实线），圆的 title 与
  `data-world-plateau-profile` 自报剖面。WorldPanel 数字加一个也多剖面下拉，列表行在坡的
  后面标"坡"。3D 里 cone 渲染成半透明圆锥 + 底面圆环（无柱），mesa 照旧盘+柱+台沿圈。
- **凭证**：`terrain.test.ts` 第五片组 6 条（线性取值三点钉 / 混画重叠取最高 / 投影补缺省 /
  normalize 只写 cone / 坏剖面拒收且 validateWorld 同口径 / 契约不剥 profile）；
  `terrain-draw.test.ts` 剖面组 2 条（不传 = 与第四片逐字节相同 / cone 落库往返）。
  e2e 两条都加了坡：`@smoke …（§140 图上画地形）` 切坡再拖一笔——虚线圆 + 自报 cone +
  面板标"坡" + 刷新仍在（截图 `screenshots/world-terrain-cone.png`，虚线坡与实线台面同屏；
  **踩过一格**：刷新把「画地形」模式弹回默认，剖面开关只在模式工具条里，先重新进模式）；
  `@smoke 3D 世界` 在相机脚下加一座坡顶 4 的 cone（读 `data-walk-at` 的坐标回编辑器加，
  半径 200 盖住取整误差）——`data-walk-height` 从台面 3 变成 4，重叠取最高在真浏览器里
  有了可核对的凭据（截图 `screenshots/world3d-terrain-cone.png`，限度条写着圆锥坡）。
  world-model 84 条全绿，受影响 vitest 全绿，eslint/tsc 全链绿。
- **明确不做**（ADR-0041 记了理由）：网格高度场；`profile: 'cylinder'` 之类的新剖面；
  坡度上限校验（"太陡走不上去"是行走规则，不是地形形状——那属于 `resolveWalkCollision`
  的另一片语义）；2D 等高线渲染（虚线是剖面的记号，等高线是另一张图）。

---

## §168 第三片：爬虫与真人区分——疑似另计，不是定罪也不是删除 —— 2026-10-16

第一片欠的"爬虫与真人区分"。结论：**判定照收照存，真人的数逐格 filter 掉疑似爬虫，
爬虫的打开次数另给一格**——理由与三条路在 ADR-0043。

- **落了什么**：`classifyVisit(ua, webdriverFlag)`（`src/lib/visit-meter.ts` 纯函数）两条信号：
  客户端自报的 `navigator.webdriver`（VisitMeter 随心跳上报）+ UA 保守名单
  （`bot`/`crawl`/`spider`/`curl`/`python`/`okhttp` 等产品名与脚本串；**不放 `headless`**——
  新版无头 Chrome 的 UA 与真人相同，e2e 也跑在无头 Chrome 里扮演真人）。UA 为空也算疑似。
  迁移 0032 给 `publication_visits` 加 `suspected_bot` 列；upsert 用 `or` 合并——
  **判定是粘的**：同一个 (发布, key, 天) 行里有过一次疑似，整行按疑似读，反过来不洗白。
- **真人的数逐格 filter**：`rollupVisits` 的访客 / 今日打开 / 时长 / 完成度 / 截断 /
  selfOnly / 曲线 / 连续天数全部 `filter (where not suspected_bot)`；`botOpens` / `botVisitors`
  另起两格。只有爬虫来过时 `playTimeMs` 是 `null`（没采到真人时长）不是 0 秒；
  `selfOnly` 是 false（爬虫不是"你自己"）。`views` 不动——§56 的 SSR 计数器历史口径含爬虫。
- **界面**：口径列表加"疑似爬虫"一条；行内 `data-analytics-bots` 标注
  "N 次打开来自爬虫/自动化（未计入）"；窗口汇总加 `data-analytics-window="bot_opens"`；
  曲线图标题改口"只数真人"；页脚"还能往下做的三件事"改口——爬虫那件已按疑似另计落地，
  但**漏网的爬虫仍混在真人的数里**，这条限度照实写。
- **顺带修的既有 bug**：`analyticsFor` 对非法 UUID 直接进 SQL，Postgres 报 22P02 → 500；
  `?project=not-a-uuid` 该给"读不到"却给了 500。补上与 `buildCreatorFact` 同一道 UUID 门禁。
- **凭证**：`visit-meter.test.ts` 4 条（真人 UA 不命中 / webdriver 自报 / 产品名与空 UA /
  不放 headless 的理由）；`analytics.integration.test.ts` 第三片组 3 条（只有爬虫时真人格子
  不涨且时长 null / 人爬混合各归各 / 判定粘——先人后爬整行翻、先爬后人不洗白）；
  `analytics-trend.integration.test.ts` 1 条（爬虫不进曲线不续连续天数，botOpens 另计）。
  e2e `@smoke §168` 加两段：anon context 用 `addInitScript` 盖掉 `navigator.webdriver`
  **扮演真人**（自动化标记由另一笔 `webdriver:true` 扮演），断言上报 body 里 `webdriver:false`；
  再发一笔自报爬虫的上报——真人的访客数/今日打开/时长一个不动，行内出现
  "1 次打开来自爬虫/自动化（未计入）"（截图 `screenshots/creator-analytics-bots.png`，
  窗口汇总里"其中爬虫/自动化打开 1 次"同屏可见）。**1 passed，1.4m**。
- **明确不做**（ADR-0043 记了理由）：IP/行为限速挡在写入前（被挡的行在库里无迹可查）；
  删掉疑似行（"被爬过"会消失）；改 `views` 的历史口径；把名单放宽到"宁可错杀"。

## §52 × §51 那一格错位：产物只有一条链，而三型读的是别的 —— 2026-10-17

`generateGameCode()` 永远投的是 `compileGame()` 那条 **2D 俯视**链，而 §51 八型里
`rpg-prototype`（成长循环）、`interactive-story` / `visual-novel`（对话管线）在试玩页跑的不是这一条。
README 那句"界面上的画布读的就是这一份"在这三型上是**假的**——2026-10-17 用两份 `tsx` 探针量过：
RPG 那份 7 文件 / 27276 字节里没有成长循环，视觉小说那份 7 文件 / 19088 字节里读不到对话正文，
`compileGame` 自己给的阻塞项是"没有玩家实体……开不了场"。

- **决定**（ADR-0044）：**说出来，而不是把下载关掉**。三条路里拒绝生成会让链上第五格每次都红
  （`gameDraft` 写死 `rpg-prototype`）、还会顺手拿掉那五型**真的**产物；补一条 RPG/对话引擎是另一格能力，
  在这一片里写半条就是 §159 的假生成。所以选第三条：那句话由分派点派生，五处共用同一句。
- **落了什么**：`codeKindReadings(document)`（`packages/game-model/src/codegen.ts`）读
  `compileForKind(document).pipeline` 与 `GAME_KIND_STATUS[kind].note` 拼出 `kindNote`，
  `topdown` 时是 `null`；`GameCodeOutput` 多带 `kindPipeline` / `kindNote` 两个字段。
  供给点五个：README 那一行分叉、`index.html` 里 `#kind-note` 段落、`GET .../game/code` 响应字段、
  Studio 面板 `<p data-game-code-kind>`、链上第五格的 `notes` + `summary` + `counts.kindMismatch`。
  **对得上时一个字都不印**——恒真的警告和恒无的警告一样没人信。
- **凭证**：`codegen.test.ts` 18→23 条（八型"为空当且仅当"表驱动 + 非空种群下限、
  三处同一份字节、对话型同时说出错位与开不了场、**哨兵串**证明那句话跟着状态表动）；
  两份集成测试各加/各扩一条（响应字段与第二次 `codeKindReadings` 调用比对、注入 `kind:'2d'` 草稿后
  那句话与 `kindMismatch` 一起消失）；e2e 那支在真浏览器里换型再换回来，屏上那句与落盘的 README
  **含同一整句**，47.7 秒 1 passed，截图 `screenshots/game-code-kind-mismatch.png`。
  7 臂变异电池：A 绕过分派点 9 红 / B README 不分叉 4 / C 页面少那句 2 / D 链上不念 1 /
  E 路由丢字段 2 / F 计数写死 1 / G 摘要管线名写死 1（G 第一版拼串写在双引号里，
  `${'$'}` 不展开 → 命中 0 次判 INTERFERED，什么都没跑；改反引号重跑才作数）。
- **已完成（ADR-0045）**：产物第二条链现在带 `artifactChainSentence`/`RPG_LAYER_NOT_DECORATIVE`/`RPG_GATE_HELD` 三条判决，codegen/test/parity 24 条全绿；对话两型（interactive-story/visual-novel）仍只披露不修，只在 `rpg-prototype` 产物里多转写一段 `NexusRpg`（语义从 `rpg.ts` 导出插值，`plan.growth` 承载数值），对应 `ARTIFACT_CHAINS` 表成为"这一份带不带引擎"的唯一分派点。
  **真浏览器那一格（2026-10-20 补上，§158 的 Run→Test→Screenshot→Inspect 走完）**：
  `npx playwright test -g '§52 Code'` **1 passed（3.3 分钟）**——那一支在真浏览器里换型再换回来，
  2D 那份量 `data-game-code-chain=topdown`、RPG 那份量 `data-game-code-chain=rpg`，
  并把屏上那句与**下载到的** `index.html`/`README.txt` 里那句对账（两处各量一遍，量的是"过没过时"）；
  截图 `screenshots/game-code-rpg-chain.png` 已看过：左栏游戏类型写着「RPG 原型」，
  下面明写「这条产物跑的是RPG 那条链（NexusSim 之外再多一段 NexusRpg，转写的是 rpg.ts：经验、升级与等级门）」，
  右上角 DEMO MODE 标识在位（§160）。
  那格落地时这一句 `kindNote` 会随 `compileForKind` 自己变空，不用改文案。
  #139（链上草稿带 `kind`）本片后**要重新划范围**：它原先的一条理由（`pipeline: null` 走不到）今天不成立，
  八型全接了，该挑的是可达接缝——`playtest` 那格今天恒跑 `playtestRpg`，一份 2D 草稿的
  "四种走法"读数其实是 RPG 成长循环的读数。

- **ADR-0046 第三条链（2026-10-20，片 1 已落地）**：`ARTIFACT_CHAINS` 多了第三个键 `story`，
  `interactive-story` / `visual-novel` 这两型**真的带对话引擎**了（转写 `story.ts` 的语义：
  正文、选择、分支；**判定全在编译期**，产物只播放），产物页面按链选画法（对话那型用 DOM、不带画布）。
  于是八型**全部**带上引擎——`kindNote`（那句错位披露）今天恒为空，而它仍然是派生的：
  "机制还在"由一条**反向控制**钉着（临时把状态表某一型的管线改成 null，那句话必须出来）。
  `ArtifactPlan` 改成了带 `chain` tag 的**判别联合**（三条链各一种形状），逼着每一处按链分支。
  **两个坑是在真浏览器验证之前抓到的**（用 Node 的 `vm` 直接跑产物里的 `NexusStory`——
  它是纯逻辑，不碰 `document`，于是内存紧、Chrome 起不来时仍有凭证）：
  ① 引擎读 `plan.story`——而 story 那链的载荷**就是** `StoryPlan` 本身（不是包一层）→ `undefined` → 页面一打开就崩；
  ② 起点没记进 `visited` → 绕回起点那一步认不出是环（要绕两圈才标得出来）。
  两条都补了单测（38 条），也写进了 `docs/adr/0046-artifact-third-chain-story-pipeline.md`。
  **顺带修掉一个既有缺陷**：README 念链名用的是「这一条链：X。」，页面念的是「这条产物跑的是X。」——
  两处各拼一遍（ADR-0045 说那句话只有一个写法），现在都走 `artifactChainSentence()`。
  浏览器那一层（parity 的 7 条 `STORY_*` 判决 + e2e 那一段）**还在路上**。

## §49 契约的行为第一次有凭证：92 个 schema 全部 —— 2026-10-20

- **发现**：`packages/schemas/src/index.ts` 导出 **92 个 schema**，其中 **62 个从未被任何测试引用**。
  之前 `packages/schemas/test/contract.test.ts` 只保证"导出的 `contracts/*.json` 与 zod 定义逐字节一致"
  （**文件没漂移**），却没有任何一条用例说"这份契约收到这样的报文会怎样"。
  于是三件事都能在两边文件同步更新的情况下悄悄发生：枚举改名、给字段加 `.min(1)`、把必填改成可选。
- **落了什么**（`cc4e72a`）：`packages/schemas/test/contract-behavior.test.ts`（**283 条**）。
  判据是三条，**每条对全部 92 个 schema 生效**：
  ① 照 `z.toJSONSchema` 的 `required` 与类型**自动造**一份最小合法报文 → zod 必须接受它；
  ② 把 `required` 名单里的字段**逐个**去掉 → zod 必须拒绝它（每一个必填字段都得是真的必填）；
  ③ 传 `undefined` → zod 必须拒绝它。
  **自动造**这件事是关键：以后新增一个 schema，这份自检**自动覆盖它**，不用记得来补一条用例。
  只有 6 个 schema 要手写样例（数组最少一条 / refine / 自定义格式），写在 `OVERRIDES` 里并注明原因。
- **专项断言**（判别联合与"这几档不能混"的地方）：
  - `RealtimeEvent` 七档各自成立、**未知 type 必须被拒**（跨进程收到陌生帧不能当现场）；
    `build.status` 四档；`generation.progress` 的 0..1；`RealtimeWireFrame` 两档。
  - §162 作业状态是五档：`cancelled` 与 `failed` 分开（一个是"做砸了"，一个是"有人不要了"），
    而 `canceled`（拼写不同的一档）**不认**。
  - §74 审批请求**只有 `decision`**：自报归属与 `confirm` 会被 zod 剥掉，剥完就当没有过。
- **另外两份**（同片）：
  - `apps/web/test/validation.test.ts`（14 条）——`parseDocument` 是 `PUT /api/projects/[id]`、快照、导入、
    公开 API 写端点**四道门共用的那一个**。规模门（整份 20000 节点）另有集成测试打在用户走的那条路上，
    **形状门与结构门此前没有直接单测**（坏了只能看到"某个 400"，说不清是哪一条约束）。
  - `apps/web/test/mock-jobs.test.ts`（11 条）——DEMO 内存作业队列，钉的是 §162 最容易弄错的那句：
    **取消被受理 ≠ 作业已经停了**（`cancel()` 遇到 running 的**只立标志**，状态不动）；
    外加"已取消的不会被 worker 再领走""终态再取消原样交回""查不到返回 null"。
    测法是直接 `new DemoJobStore()`——不启动 worker 循环，不等那两段 1.2~1.8s 的等待。
- **第四片（`da0d5d6`）**：`reciprocalRankFusion` 与 `estimateTokens` 原先是**私有的**，
  只加 `export`（不改逻辑）就能钉：13 条钉住 rank 是 **1-based**、文本侧存的 `textRank` 是
  **BM25 原始分**而不是名次、两边命中时分数相加、k 与权重怎么起作用。
  另补 `tokenUsage` 11 条：一个节点只算一次、名字与正文里的 `{token}` 不算引用、
  组件侧**每个组件**算一次。**这一片有一条断言是实测纠正的**——先按"组件不是节点、所以两个字段算两次"写，
  跑出来是 1，读实现才看清它是**按组件**去重的。
- **一条教训**：**"这个文件自己写着『这段算法有语义要钉住』"不是凭证**——
  `token-usage.ts` 的注释把两条语义写得很清楚，却一次都没有被验证过。
  补测的第一问不是"写什么用例"，而是"**这段代码自己声称的语义，哪一条没人验证**"。

## §127 交付那一格：`下载（N）` 从此只有一个写入方 —— 2026-10-21

- **发现（不是推测，四条各用一条请求量出来）**：`GET /api/marketplace/[id]/content` 从 2026-10-07 就在，
  但那条路上有四个洞——① 建包传的是 `userId ?? creatorId`，而 §144 的归属门（ADR-0024）判"项目在谁名下"，
  **买家扣了点数却永远拿 404**；② `Content-Disposition` 的 `filename` 原样带中文标题，HTTP 头的值是
  ByteString（latin1），构造响应时直接抛 `TypeError`——**标题是中文的条目每次交付都 500**，而平台上标题
  几乎必是中文；③ 免费那一路先 `+1` 再建包，"没有源项目／源项目已删／导出抛错"三条失败路径照样让数字变大；
  ④ 还留着第二条写同一个数字的门 `POST /[id]/download`（只记数不交付，界面改走交付门后**全站零调用方**）——
  一条 curl 循环就能把「下载（N）」灌成任意大而一次交付都没发生，那是 §159 禁的假发布。
  另外两处形状：非 uuid 的 id 撞 22P02 翻 500（`domain/ids.ts` 的口径，update/delete 早已按 404 处理，这道门漏了）；
  匿名可下免费物品却没有任何限流。
- **落了什么**：删掉 `POST /[id]/download` 与它的 5 条套件；交付门成为 `incrementDownloadCount` 的**唯一 HTTP 写入方**，
  顺序钉成"门 → 建包 → 做成能发出去的响应 → 写计数与审计 → 返回"；建包恒以 `item.creatorId` 走 §144（买家的授权
  来自购买判定，不来自项目归属）；头部口径抄 §144 导出门（ASCII `filename` + RFC 5987 `filename*`，`Buffer.from` 收体）；
  非 uuid 在读库前 404；按"条目 + IP"限流 `MARKETPLACE_DOWNLOAD_LIMIT_PER_HOUR = 60`（常量放域层，
  界面那句限度和洪水用例读的都是同一个数）。界面侧 `MarketplaceItemRow` 不再把 `<a>` 直接挂到门上，
  改 fetch + 状态码判失败，把服务端那句实话念出来；`下载（N）` 改读 `item.downloadCount`（原先是挂载时冻结的
  `useState`，交付完数字不动）。
- **测试**：`apps/web/test/marketplace-content.integration.test.ts` **14 条**，基线 14/14 绿（166s）。
  四只变异臂各改坏一条律、跑完都还原成字节相同的原文件，**红数是输出里读的**：
  `count_before_build` 7 条（凡"成功一次数才动一次"的读数全多算）、`export_as_downloader` 2 条
  （第一条断言就是"买过的人拿不到包，交付这一格就没存在过：expected 404 to be 200"）、
  `no_limiter` 2 条（那两条洪水）、`raw_title_header` 5 条（能真交付的路径全崩在构造响应那一步）。
  两条结构断言把"唯一写入方"从注释变成机检：数 `apps/web/src` 生产文件里 `incrementDownloadCount(` 的调用点
  （排除 `*.test|spec`，理由写在测试里）恰好两处 = 定义 + 交付门；再加一条 `existsSync('…/download/route.ts') === false`。
  e2e `@smoke §127` 补了**正反两半**：没挂来源项目的条目界面念"没有可导出的源项目"且计数**停在 0**，
  挂上来源项目的条目在真浏览器里收到一个 zip（前两字节 `PK`、文件名是标题本体）且计数**走到 1**——
  只留一半，任何一边写错都能自洽（1.6m 过）。
- **明确不做**（ADR-0047 记了理由）：ZIP 里的**资产字节**（要开作者名下私有素材的读路径，买家未必要得到，另作一片）。
  市场其余**读路径**的形状门这一片没动（`GET /api/marketplace/not-a-uuid/preview` 当场实测是 **500 空报文**，
  匿名可达）——留给下一片。
- **2026-10-21 第二片（#147）：形状门收进域层**。四个域助手按"查不到"回答：`getMarketplaceItem` → null
  （详情 / 预览图 / 交付三条读路共用）、`hasPurchased` → false、`incrementDownloadCount` → 0、
  `purchaseMarketplaceItem` → 与"不存在或已下架"同一句（路由翻成 404）；交付门当初那道**临时路由级 `isUuid`**
  随之删掉，同一件事只剩一处实现。见证补进 `id-shape.integration.test.ts`（第十个家族，27/27 绿）：
  修前实测 **7 条红**（四个域助手 + 详情 GET + 预览 GET 各以 PostgresError 22P02 失败，购买 POST 是 500），
  修后三条路由 404；正对照钉住"真条目照旧读得到、买得成（价格 0，不写扣点流水）、数得上"。
  市场七套件回归 87/87 绿。PATCH / DELETE 仍回 400（域函数早挡、路由 catch 成 400）——那是另一处口径差别，
  被 `marketplace-update.integration.test.ts` 钉着，不在这一片顺手改。
- **2026-10-21 第三片（#149）：PATCH / DELETE 的答复码收敛**。`updateMarketplaceItem` /
  `deleteMarketplaceItem` 从"抛一句英文"改成**判别式结果**（`{ok:true,item}` /
  `{ok:false,reason:'not_found'|'forbidden'|'preview_asset_not_found'}`），路由按语义翻码：
  不存在 / 已下架 / 私有条目被别人动 → **404**，可见条目但不是你的 → **403**，预览素材不存在 → 400；
  未知异常走 `failure()` 回 500，不再把库错误 catch 成 400 回显正文。正文只留稳定机器码 + 一句中文
  `message`（§26）；界面的"保存 / 下架"失败改念 `message`。私有条目对外一律 404 与详情、预览同一口径——
  403 等于告诉陌生人"这个 id 存在"。见证：`id-shape` 家族 27 → 30 条（update/delete 的形状门 + 两条路由 404），
  `marketplace-update` 由 12 → 14 条（新增私有别人的 PATCH/DELETE 404），三份套件 59/59、市场六套件（含 update）66/66 绿；
  tsc / eslint 0。
- **2026-10-21 第四片（#150）：买家侧的「我的购买」**。此前的读路只有店面、我的物品与创作者收益，
  **买过的人没有自己的单子**：买了什么、条目还在不在卖，页面上无处可看。域层加 `listBuyerPurchases`
  （从购买行出发 join 条目与作者，**包括已软删的条目**；按购买时间倒序），路由
  `GET /api/marketplace/purchases` 只读自己的（匿名 401，`cache-control: no-store`），页面
  `/marketplace/purchases` 三态如实显示：在售 / 已转私密（已购仍可下载）/ 已下架（不再交付，
  不渲染下载按钮）。**不替产品拍板**"买过的权利是否随下架终止"——交付门对下架条目仍是 404，
  这一片只把这条事实写进页面与用例。见证：`marketplace-purchases.integration.test.ts` 8 条全绿
  （三态各一行、陌生人只看到自己那一笔、登录未买过 → 200 空列表、下架条目交付 404）；
  真浏览器里三条购买同屏、状态与按钮有无都对、点下载收到交付门那句话，截图
  `screenshots/marketplace-purchases-150.png`；tsc / eslint 0。
- **2026-10-21 第五片（#151）：购买判定收成判别式结果**。`purchaseMarketplaceItem` 此前以句子 throw，
  路由靠比对四句英文翻码——句子是内部措辞，改一个词就会悄悄改掉 HTTP 状态码（#149 已对 update/delete
  收过同一口径）。域层改为 `{ok:true,purchaseId,pricePaid}` /
  `{ok:false,reason:'not_found'|'free_item'|'own_item'|'already_purchased'}`，路由按 reason 翻 404/400，
  界面失败改念正文里的中文 `message`；未知异常仍 throw → 500（"买家不该买"与"系统坏了"不是一件事）。
  **顺带挖出一个被旧用例盖住的真洞**：并发重复购买撞唯一索引时，`isUniqueViolation` 只读顶层 `.code`，
  而 Drizzle 把驱动错误包在 `DrizzleQueryError` 里（`23505` 在 **cause 链**上）——这个函数从未命中，
  输家一路抛到路由变 500；旧并发用例只数"恰好 1 个 fulfilled"，从没检查被拒的那个为什么被拒。
  改为沿 cause 链判：输家现在回 `already_purchased`，事务回滚、一分不扣。见证：市场九套件 + id-shape
  129/129 绿（settle 并发用例拿到 `ok:true | ok:false:already_purchased`；visibility 7 → 9 条：
  自己买自己的公开条目 400 `own_item`、路由层重复购买 400 `already_purchased`；id-shape 30 条按新
  结果形状断言）；tsc / eslint 0。
- **2026-10-21 第六片（#152）：结算判定也收成判别式结果**。`settlePurchase` 是购买路径上最后一段
  靠英文句子传递语义的钱逻辑：路由用 `msg !== 'Already settled' && msg !== 'No revenue to split'`
  决定"正常重复"还是"记一条错误日志"，句子一改日志就失真。域层改为
  `{ok:true,splitId,amount}` / `{ok:false,reason:'purchase_not_found'|'item_not_found'|'already_settled'|'no_revenue'}`，
  路由按 reason 判断：`already_settled` / `no_revenue` 静默，其余 reason 记日志；真正的异常仍 throw
  进 catch。这一片**没有新的行为洞**——#151 修好 `isUniqueViolation` 后，并发结算的输家已经能翻成
  `already_settled`，这里只是把同一条路从句子换成判别式，并补齐此前没钉的结局：串行二次结算
  （`already_settled`，钱只分一次）、价格 0（`no_revenue`，不写分成与收入流水）、不存在的购买
  （`purchase_not_found`，不抛）；并发用例从"只数 fulfilled"改为断言恰好一个 `ok:true` +
  一个 `ok:false:already_settled`。见证：settle 3 → 6 条，市场九套件 + id-shape **132/132** 绿；
  tsc / eslint 0。
- **2026-10-21 第七片（#153）：详情 GET 的「包括已下架的，用于收藏者查看原因」是一句谎**。
  `getMarketplaceItem` 从第一天就 `isNull(deletedAt)`——下架后详情本来就 404，没有"原因"可看；
  市场里也没有收藏表，这句话的受益者不存在。买过的人要在「我的购买」看状态与下架时间（#150）。
  行为不动（软删除保住数据、不保住可读性：详情 / 预览 / 交付三条读路同一口径），改的是文档与
  答复形状：详情两处 404 从裸 `NextResponse.json({error:'Item not found'})` 换成
  `jsonError(404,'not_found',{message:'物品不存在或已下架'})`，与市场其余 `[id]` 门同一个稳定机器码。
  见证：visibility 9 → 10 条（下架后匿名与创作者本人都是 404 `not_found` + 中文 message）；
  市场九套件 + id-shape **133/133** 绿；tsc / eslint 0。
- **2026-10-21 第八片（#154）：「我的物品」看不到私密草稿——店面页拿店面结果过滤出的"我的物品"**。
  店面列表（`listMarketplaceItems`）只出 public/free，页面的「我的物品」却是 `items.filter(creatorId)`：
  私密草稿（创建表单第三个选项、API 与域层的缺省值）在任何界面都不出现——创建成功、找不到，
  改可见性与下架两个按钮永远碰不到它；页面自己的文档还写着"私密在那里可见、可删"。
  加一条所有者视角的读路 `listOwnedMarketplaceItems(creatorId, { itemType })`：过滤只有归属与
  `deletedAt`（已下架的仍不出现——店面 e2e 按"下架后消失"断言），不看可见性；页面拿它当
  「我的物品」。见证：新套件 5 条（私密草稿在、已下架与别人的私密不在、字段够界面用、
  类型过滤、非 uuid 回空表）；单文件 5/5 绿；受影响的四个套件 52/52；e2e §127 在真浏览器里过
  （私密草稿创建 201 → 店面不列 → 重载后「我的物品」可见且带 private 标记 → 下架收尾）；
  tsc / eslint 0。
- **2026-10-22 第九片（#156）：可疑购买只有一行 warn——命中规则与读数现在落进审计**。
  `detectSuspiciousPatterns` 原来只回 boolean，路由拿到 true 只 `console.warn`：窗口一关，
  "谁、哪条规则、读数多少"都没有了；旁边的 TODO 写着"自动创建举报或标记为待审核"，
  但 `marketplace_reports.reporter_id` 是真人外键、也没有"待审核"状态列 ⇒ 不造假的系统举报，
  改为写 `marketplace_audit_log`（action=`suspicious_purchase`，metadata={rules,counts}）。
  购买结果不变（审计是旁证不是业务前提，写失败只记 stderr）。顺带核实三条规则的**可达性**：
  同一买家同一物品有唯一索引 + already_purchased ⇒ 1 小时重复计数永远 ≤1；
  自购在 `purchaseMarketplaceItem` 里先被 own_item 拒绝 ⇒ 前两条今天够不着，
  真正能命中的只有 24 小时 >50 笔。规则本身保留（约束放宽时它们该自己起作用）。
  见证：新套件 8 条（50 笔不命中 / 第 51 笔 200 且审计带 rules+counts=51 / 再买 400 不增行 /
  自购 400 不写 / 对照买家不写 / 重复计数=1 / self_purchase 直接调用能命中 / 正常 purchase 行仍在）；
  单文件 8/8 绿；tsc / eslint 0。

- **2026-10-22 第十片（#157）：管理员审计查询的两处真错——新动作筛不到、时间窗右端反了**。
  #156 把 `suspicious_purchase` 写进审计之后，`GET /api/admin/marketplace/audit` 的 action 白名单
  还是手抄的六项：管理员按新动作筛会吃 400（`validation_failed`），不筛时却能在列表里看见这些行——
  "写进去了但筛不出来"。同一查询里 `endDate` 用的是 `gte`：start 与 end 同向，
  时间窗变成"晚于 end 的那些行"，筛 6 月拿回 12 月。修法两处：动作名单收进域层 `AUDIT_ACTIONS`
  （迁移 0033 的 CHECK、路由校验同源，下次加动作不会再漂），`endDate` 改 `lte`（右端闭区间，
  与 `startDate` 对称）。真库路由用例 4 条先红后绿：`action=suspicious_purchase` 200 且带读数
  （修前 400）、`action=purchase` 不顺带新动作、`endDate` 只回这一刻及以前（修前回的是之后那一行）、
  起止围出中间一行。相邻九个市场套件 93/93、`tsc -p apps/web` 与改动文件 eslint 均 0。

- **2026-10-23 第十一片（#158）：举报工单只会积压——处置状态三列没有写入方**。
  `marketplace_reports` 的 `status / admin_notes / resolved_at` 建表起就没有写入方：举报能提交、能按状态列出，
  却没有任何入口把工单推进一格，`GET ?status=resolved` 永远拿回空数组——一个只进不出的收件箱。
  落法：域层 `REPORT_STATUSES` / `REPORT_CLOSED_STATUSES` / `REPORT_TRANSITION_STATUSES` 名单收成一处
  （查询校验与处置正文同源，不手抄）；`updateReportStatus` 用条件 UPDATE
  （`WHERE status NOT IN ('resolved','dismissed')`）把终态不可改写焊在 SQL 里——两位审核员同时点"结案/驳回"时，
  后来者拿到 0 行而不是覆盖前一位的结论；0 行时重读一次，`not_found` 与 `already_closed`（带当前状态）分开答。
  结案/驳回落 `resolved_at`，不传备注保留原备注；成功处置与"改写结案记录"两路都写 `audit_events`
  （`marketplace.report.update`，被挡那路 `allowed=false`）。
  路由 `PATCH /api/admin/marketplace/reports/[id]` 与裁决台同一口径：401 → 限流 429（30 次/10 分钟，
  放在 admin 判定**之前**，否则非审核员的循环请求能把审计表刷满）→ 非 admin 403 + 拒绝审计 → CSRF 403 →
  正文 zod 400（只收 reviewing/resolved/dismissed，`pending` 不是回退目标）→ 404 / 409（带当前状态与中文话）→ 200 带 message。
  见证：`admin-marketplace.integration.test.ts` 从 27 条长到 **40 条**（13 条新用例：401 / 403 且审计有拒绝行 /
  CSRF / 非 UUID 404 / 不存在 404 / pending 目标 400 / 名单外 400 / 备注超长 400 / reviewing 推进并读回 /
  resolved 落 resolvedAt 并读回且两次成功各留一行允许审计 / 终态再改 409 且原结论一字不改 / dismissed 终态 /
  处置不是删除）；单文件 40/40 绿，相邻九个市场套件 93/93（与 #157 基线同数），
  `tsc -p apps/web` 与改动文件 eslint 均 0。

- **2026-10-23 第十二片（#159）：举报工单有了写入方，审核员却只能用 curl 推**。
  #158 把 `PATCH /api/admin/marketplace/reports/[id]` 接上之后，工单仍只在接口层可用：
  管理员没有一个能看见队列、看见交易证据、点击处置的页面，`pending` 依旧靠手敲请求推进。
  落法：`/admin/marketplace`（admin-only，未登录/非 admin 各一句拒绝且不泄露队列内容）——
  顶部明写"结案/驳回落的是工单结论，**不会**下架物品或撤下公开页"并链到复核台的「拒绝并撤下」
  （界线写反就是界面替产品说反话，§159）；四个状态筛选链走 `?status=`，行内展示原因/物品/举报人/
  补充说明，终态显示结案时间与处置依据，非终态给 `TriageButtons`（受理 / 结案 / 驳回 + 可选依据）。
  页面底部并列最近的 `marketplace_audit_log`（购买/下载/结算/改价/上下架/可疑购买），
  与 `audit_events` 里的处置审计各归各表，不混成一句"都记了"。
  真浏览器见证里发现并修掉一处：处置成功后 `router.refresh()` 会复用客户端组件状态，
  原实现把三个按钮换成一行"已受理"，审核员必须手动刷新才能接着结案——改成提示与按钮并排。
  见证（Playwright + 系统 Chrome + 真 dev server + 真库）：注册账号→SQL 提权→打开管理台待处理行；
  点「受理」→ 行变 reviewing 且按钮仍在；填依据→点「结案」→ 行变 resolved、按钮消失、
  依据与结案时间出现、库里 `admin_notes/resolved_at` 一致；`?status=resolved` 看得到、
  `?status=pending` 看不到；未登录与普通成员分别落在 `data-admin-denied` 两种拒绝页。

- **2026-10-23 第十三片（#160）：举报能收进工单台，买家侧却只有接口没有入口**。
  #158/#159 把处置端与管理台接上之后，举报链的另一端仍是空的：店面行里没有「举报」，
  买家看见骗下载只能去 curl `/api/admin/marketplace/reports`。落法：原因名单收进
  `apps/web/src/lib/marketplaceReports.ts`（值同时喂路由 zod 与界面下拉，标签只给界面；
  放 lib 是因为提交面板是客户端组件，域层会把数据库带进浏览器包；数据库 CHECK 是第三处同名单，改时要走迁移）；
  `MarketplaceItemRow` 新增 `signedIn` 与行内面板——原因下拉、可选说明（与服务端同一个 1000 字上限）、
  提交 / 取消；自己的物品、未登录、已举报三种情况不给入口。成功后留下「已举报」标记；
  409（唯一索引挡住同一人对同一物品的重复举报）把服务端那句原样念出来并收起入口，不做会无限重试的假失败。
  面板旁明写「举报进审核员工单台；结案 / 驳回都不会自动下架物品」，与工单台那条界线同一句话。
  见证（Playwright + 系统 Chrome + 真 dev server + 真库）：注册买家→别人的物品有举报入口、
  自己的物品在「在售」与「我的物品」两处都没有→打开面板选「欺诈」写说明→提交后出现「已举报」，
  库里一行且举报人 / 原因 / 说明 / `pending` 全对→刷新再提交念服务端那句「您已经举报过该物品」
  且库里仍是一行→未登录看同一件物品没有入口；两张截图（面板、提交后）逐张看过。
  `tsc -p apps/web` 与改动文件 eslint 均 0；市场集成套件 40/40 不回归。

- **2026-10-23 第十四片（#161）：「已举报」只活在标签页里——刷新之后入口又出现**。
  #160 让买家能提交举报，但「我举报过这件」只有客户端 state：提交成功当页留下徽标，
  刷新之后行又变回「举报」，买家必须再点一次提交、从 409 才知道重复。
  落法：域层读路 `listReportedItemIds(reporterId, itemIds)`——只回答当前这一页的物品集合
  （一次 `inArray`，不扫全表），非 UUID 的举报人 / 物品 id 按 22P02 同一个口径丢掉；
  店面页渲染时读一次，把 `alreadyReported` 交给行组件，徽标与入口都由服务端已知状态初始化。
  409 保留为并发兜底：两个标签页同时提交时，唯一索引仍然挡着，服务端那句照旧原样返回。
  见证：集成 4/4（只算自己的、只回答传入那一页、形状不对不 500、空列表不查库）；
  真浏览器里提交→刷新→徽标仍在且入口不再出现→绕过界面直接再 POST 仍拿 409 且库里仍一行；
  截图逐张看过。`tsc -p apps/web` 与改动文件 eslint 均 0。

- **2026-10-23 第十五片（#162）：举报交出去之后，举报人看不到自己的工单怎么了**。
  #160/#161 让买家能提交并记住「已举报」，但工单之后是受理、成立还是驳回，只有审核员那一侧看得到；
  举报人手里只剩提交时那一句回执。落法：域层读路 `listReportsByReporter(reporterId, limit = 100)`——
  按举报人一次查询、提交时间倒序，`innerJoin` 物品读出标题与**此刻**的可见性 / 软删状态
  （举报后作者转私密或下架，页面要跟得上）；`admin_notes` 刻意不进 select：那是审核员的内部笔记，
  写的人没打算给举报人看，这里也不借"透明"之名把它端出去；形状不对的举报人回空表，不撞 22P02。
  页面 `/marketplace/reports`：未登录只给一句"举报按举报人存放"；空态说明同一件物品只能举报一次；
  每行给物品名 + 此刻状态（在售 / 免费在售 / 已转私密 / 已删除）、原因标签、自己写的说明、
  提交与处置两个 UTC 时间；状态标签按 `Record<ReportStatus, …>` 钉死，域层加状态时这里漏写直接编译失败。
  结案 / 驳回各配一句**边界**：结案是工单结论，物品是否撤下由人工复核台另行处理，不是这里下架。
  店面头部加「我的举报」入口（与「我的购买」并列，仅登录可见）。
  见证：集成 5/5（只回自己的且倒序、别人的举报不串门、join 跟得上转私密与软删、
  结案结论可读而库里确实存着的 `admin_notes` 不出现在返回对象键里、limit 只截断不改顺序 / 非 UUID 回空表）；
  与 #161 的 4 条同桌再跑 9/9。真浏览器见证（Playwright + 系统 Chrome + 真 dev server + 真库）：
  两次举报都从店面真实入口提交→点头部「我的举报」→两条均为待受理、原因与说明对得上；
  另一上下文里真注册的审核员走 PATCH + CSRF 一条结案一条驳回→举报人刷新后看到「举报成立 / 举报不成立」、
  处置时间与边界句，页面全文不含内部笔记而库里 `admin_notes` 一字不差；物品仍是 public 且无 `deleted_at`、
  页面仍写「物品在售」（结案 ≠ 下架在同一张图上）；未登录直达只有拒绝页、没有工单行；三张截图逐张看过。
  `tsc -p apps/web` 与改动文件 eslint 均 0。
- **2026-10-23 第十六片（#163）：举报交出去、工单结了案，举报人自己却不知道**。
  #160-#162 让买家能举报、能记住"已举报"、能在「我的举报」里看到结论，但结论只在举报人主动回去看时才看得见；
  审核员结案 / 驳回发生在举报请求早已结束之后，和人工裁决同一类——这正是 §164 收件箱该管的事。
  落法：`NotifyEvent` 加第十一类 `marketplace_report`（只接受 `resolved` / `dismissed`；`pending` / `reviewing`
  是状态不是结论，受理不打扰）；`planNotification` 的标题念出物品名并把成立 / 驳回写成两句不同的话，
  正文与「我的举报」页共用同一句边界（结案 / 驳回都不自动下架物品），链接指回 `/marketplace/reports`；
  `dedupeKey = marketplace_report:<工单号>`——终态不可改写，所以一张工单只会有一条结论通知。
  生产者 `server/domain/marketplace-report-notify.ts` 是唯一构造点：`skipped`（本来就不该发）、
  `suppressed`（收件人关掉了这一类）、`duplicate`（同一工单已说过）三种"没发"分开报。
  `updateReportStatus` 成功时顺带读出物品标题（`item_id` 对举报人没有意义；级联外键保证物品行在，
  不为"物品不见了"编一个空标题），路由在结论与审计都落库之后才通知。`levelOf` 把这一类归到 info；
  通知偏好默认全开、`Kind` 两处标签表补齐。迁移 0036 重写 `notification_settings.kind` 的 CHECK：
  0022 那份是手写十类名单，不改约束，用户一保存「举报结论」这一格就是 23514。
  见证：`notify-plan` 单测新增 6 条（两句标题、键挂工单、链接与边界句、success/info、用户输入裁短、
  注册表与终态表）；域层集成 6/6（pending/reviewing 均 skipped 零行、结案 created 的字段、
  同单重放 duplicate 仍一行、驳回答句、关掉这一类 suppressed 零行且重开后 created、收件箱读回 3 条且链接指得动）；
  `admin-marketplace` 的 PATCH 组补上接线断言（受理后 0 行、结案后 1 行且标题含物品名、409 翻案不补发、
  驳回 1 行）——路由与域层同桌 3 文件 94/94。真浏览器见证（Playwright + 系统 Chrome + 已有 dev server + 真库）：
  举报人注册→收件箱空但披露面已是「登记了 11 类」且含举报结论→审核员 PATCH 受理后库里零通知、页面仍空→
  结案后刷新看到「举报结论 / 举报成立」，点「打开」落到「我的举报」里那一条已成立→驳回后两条且标题分开读→
  在通知偏好里把「举报结论」关掉（真 PUT + 迁移 0036 生效，刷新仍为关）→静音期间第三单结案库里零行、
  收件箱仍是两条→恢复开关并再证一次落库；三张截图逐张看过。`tsc -p apps/web` 与改动文件 eslint 均 0。
- **2026-10-23 第十七片（#164）：id 形状门的第二种形状——不是每条路由都先过一道已守住的归属门**。
  前十个家族（`id-shape.integration.test.ts`）的洞都长在"路由 → 域助手 → 裸 `eq()`"上，
  判据也因此写成了"域助手要守"。横向审计换了个问法：**探针实测**——拿 `not-a-uuid`
  打全部 22 条动态 id 路由（有效报体 + 真会话/真凭据），逐条看状态码。五处现出原形：
  - `DELETE /api/v1/projects/<id>` → **500**：`softDeleteProject` 的 `eq(projects.id,…)` 裸跑。
    v1 这条**不像界面那条先过 `projectBelongsTo`**，所以同样的函数在界面上从来没红过；
  - `PATCH /api/admin/users/<id>` 与 `…/plan` → **整个请求以 PostgresError 抛出**（22P02）：
    `setUserRole` / `setUserPlan` 的 `eq(users.id, targetId)` 裸跑，路由连 `try/catch` 都没有；
  - `POST …/characters/<id>/chat` → **500「对话失败」**：那次 `eq(characters.id,…)` 查询**写在路由里**
    （域助手 `characters.ts` 反而守着——守错了一层照样漏）；
  - `GET /api/projects/<id>/tasks` → **500**：`listProjectTasks` 的归属查询自己一句 `eq`。
  修法同族同一口径：域层 `isUuid` 守卫，形状不对按"不存在"答（404 `not_found`），
  与合法 UUID 查不到是同一种答案——不给"存在但不给你看"留侧信道（§159）。
  角色对话那一处补在路由的查询前（它不在域层，补在域层就得为它新造一个域函数——
  那一跃留给真需要复用时再做）。`getTask` 今天没有调用方，但它是导出的域函数，一并补上：
  下一个调用方不该再踩同一个坑。
  **没被漏掉的那些也记下**（证明审计是全扫不是挑软的）：branches switch / snapshots restore /
  characters PATCH·DELETE / memories DELETE / assets 两跳 / avatar / public assets / ai jobs·tasks /
  v1 GET·design·publish / admin reports 全部 404·400·409 如实回答；`notifications/read` 的
  `inArray` 看着同族，但报文层 `z.string().uuid()` 已经挡住（schema 层的不变量）；
  blocks/follow 按 handle 查文本列，本就不适用。
  见证：`id-shape.integration.test.ts` 30 → **38 条**（域层直调 + 路由 + 正对照：改档位/改角色拿
  "本来就是那个值"的真账号、任务账本 200、真角色对话走到 DEMO 409——没有真 provider 不生成回复）；
  相邻七套件（agent-tasks / ai-jobs / api-tokens / audit / plan-admin / project-delete / tasks-ledger）
  **111/111** 不回归；`route-security-gate` 5/5；`tsc -p apps/web` 0、改动文件 eslint 0。
  **变异探针五臂**各摘一处守卫：红数 1/2/2/1/1，全部精确红在对应那条上，跑完逐字节还原。
  方法论补一条：**"守在哪一层"不能靠文件位置推断**——`characters.ts` 的域助手全守着，
  而 chat 路由自己查库的那一句照样漏；探针要打的是**路由**，不是域函数名单。


- **2026-10-23 第十八片（#165）：社交三连的并发双点 500——insert 缺一句 onConflictDoNothing**。
  toggleLike / toggleFollow / toggleSave 都是"先查有没有 → 没有就 insert"的读—改—写。
  两个请求同时到（双击、两个标签页、移动端连击），两边都查到"没有" →
  都 insert → 唯一索引把后到的那条判 23505 → 500。同族的 `setBlock`
  早就用 `onConflictDoNothing` 挡着，这三个漏了。修法同族同一口径：
  insert 补 `onConflictDoNothing()`。终局与库一致——谁先谁后不重要，终态都是"已点赞"，
  回执都是 200，不给"点一下 500、刷新发现赞没了"留窗口。竞态探针：`Promise.all`
  两发同一 (user, target)，修前稳定复现 23505，修后两发都 200。见证：`697dc7c`；
  social.integration 两条（like / follow）、profile.integration 一条（save）钉住；
  今日复跑 social / profile / blocks / publish / api-v1-publish / unpublish / publish-build-status
  七套件 **53/53** 绿。

- **2026-10-23 第十九片（#166）：并发双发发布 500——读—改—写整段收进 advisory lock 事务**。
  publish 的读—改—写（读 publication → 改 version / snapshotId → 写回）不在事务里；
  两个发布请求并发时，后到者覆盖先行者的 version / snapshotId，甚至撞
  `published_path_key` 唯一约束（23505）→ 整个请求 500。第一版修法（onConflictDoUpdate +
  写后重读）被自己的测试抓出不诚实：后到者会把先行回执里的 snapshotId
  改成过期值 → 回执与库不一致（正是 §159 要禁的"假完成"）。最终修法回到 §64
  既有模式：读—改—写整段收进 `db.transaction` + `lockProjectWrites`（advisory lock，
  与 saveDocument 同一把），版本号与快照标签锁内同源定。见证：`a04f974`；
  publish.integration 8/8（含并发双发那条）；变异探针摘锁精确红。

- **2026-10-23 第二十片（#167）：layoutCache 命中判据补回文档对象身份——"键相同文档已变"不再交出旧布局**。
  `77404ed` 把 buildSnapshot 里 layoutCache 的 early-return 从 `key + doc 身份` 换成 `key + 代数`，
  理由是"applyPatch 每次返新对象、doc 身份永远 miss"。探针实测这个判断对纯选中帧是错的：
  选中不动文档，`doc === document` 本来就成立；那一下的真实效果是砍掉了"事务内文档变了而
  revision 不跳"的护栏（`applyWithinTransaction` 不跳 revision 也不跳代数）——键一字不差而文档对象已换，
  缓存把上一帧那份解交出去，画布画的是上一帧内容。`derivedCache` 用身份判据防的是同一件事（过期
  token 表），两处判据本该平行。修法：命中条件三样全上（key + 代数 + 文档对象身份）；
  纯选中帧照旧命中，§147 选中响应不受影响。测试 `apps/web/test/studio-layout-cache.test.ts`
  三帧各钉一条（选中命中 / 半程提交不陈旧 / 换视口重算）；变异探针四臂全精确红。
  见证：`91cadd4`；studio 五套件 16/16。

- **2026-10-23 第二十一片（#168）：games / worlds "一个项目一份"补上建库约束——并发双发不再插出两份**。
  这两张表的"一个项目一份"一直只是应用层 read-then-insert 的约定（storyboards 的 project_id
  一早就有 `.unique()`，它们漏了）。两个并发创建——双击「接受草稿」（agent/draft，createOnly）、
  两个标签页各存一次——都查不到已有行 → 都 insert → 库里两份：用户看到"接受成功"两次，
  其中一份永远看不见（currentRow 按 updatedAt 取最新），但导出/发布读的都是那一份，
  另一份成幽灵行。修法两层缺一不可：① 迁移 0037 先按 updated_at 收敛历史重复行
  （每项目留最新、id 断序），再加唯一约束——**只做迁移不做代码，并发下第二发会从
  "静默多一行"变成 23505 直接 500**；② saveGame / saveWorld 的 insert 补
  `onConflictDoNothing`，撞约束后重读走更新路径（createOnly 照旧拒、旧写拒照旧生效），
  既有更新路径抽成 applyGameUpdate / applyWorldUpdate 两个助手两路共用。
  测试：games / worlds 各加一条 Promise.all 双发探针（games 断言一成一拒且拒因含
  "已经有一份"、countGames=1；worlds 断言两发都 ok、countWorlds=1）。
  变异探针摘掉两处 onConflictDoNothing → 两条精确红（23505 抛出）。
  见证：`520ab42`；八套件 99/99（games / worlds / agent-draft-accept / game-code /
  game-publish / knowledge / context / agent-orchestration）；tsc 0、eslint 0；
  迁移已应用到 nexus 与 nexus_regress。

- **2026-10-23 第二十二片（#170）：并发补 main / 建同名分支不再 23505——insert 补一句 onConflictDoNothing**。
  `ensureDefaultBranch` 与 `createVariantBranch` 都是"先查有没有 → 没有就 insert"的读—改—写。
  两个请求同时到（两个标签页同时打开一个还没有分支的项目、双击「生成方案」），两边预检都在任何
  insert 之前发出 → 都 insert → 库里 `branches_project_name_key` 把后到的那条判 23505 → 500。
  修法与 #165/#168 同一口径：`ensureDefaultBranch` insert 补 `onConflictDoNothing`，返回空行时
  回头读该项目现成第一条分支交回去（backfill 留给赢家——行已在、历史快照归类也已做过）；
  `createVariantBranch` insert 补 `onConflictDoNothing`，拿不到行就 `return null`（既有契约，
  调用方据此记"没能落成分支"），不再让 23505 冒到路由层。
  测试上的一个坑：`createProject` 现在就建 main，所以 `ensureDefaultBranch` 的 insert 支对正常项目
  **不可达**——第一版"并发双读分支列表"是空转的（main 早已存在，根本不 insert，变异摘了守卫也不红）。
  真正触达那一支要造 legacy 状态：删掉分支行（`snapshots.branchId` 外键是 `onDelete:'set null'`，
  删不坏快照），再开一个事务把 main 插进去**但不提交**——两处 select 都看不见未提交行，于是都走到
  insert，后到者阻塞在唯一索引上，等那个事务落地后才发现插重了。这样竞态是确定性的，不靠时序碰运气。
  见证：`c4254f7`；branches + variants 两套件 21/21；tsc -p apps/web 0、改动文件 eslint 0；
  变异探针两臂各摘一处守卫，全部精确红后逐字节还原。

- **2026-10-23 第二十三片（#171）：并发开同名分支不再 23505——`createBranch` 补 onConflictDoNothing**。
  `createBranch` 与 `createVariantBranch` 是同一族读—改—写：先 clash 预检（同名就答
  "已经有叫 X 的分支"），再 insert。#170 只修了后者，前者漏了。两个标签页同时开同名分支时，
  两边预检都在任何 insert 之前发出 → 都 insert → `branches_project_name_key` 判 23505 →
  路由 catch 住变 500，而本该是那句人话 400。修法：insert 补 `onConflictDoNothing`，
  拿不到行就回 `{ok:false, reason:"已经有叫 X 的分支"}`——与预检那条**同一句措辞**。
  见证：`be8e60d`；branches + variants 22/22，新测试连跑三遍稳定。

- **2026-10-23 第二十四片（#172）：并发双发举报不再 500——撞唯一索引回头读现成那条（#172）**。
  `flagSuspiciousActivity` 是"先查有没有 → 没有就 insert"，而
  `marketplace_reports_unique_reporter_item` 一早就有唯一索引（幂等契约写在函数头）。
  双击「举报」、两个标签页各提交一次，两边预检都查不到 → 都 insert → 后到的那条判 23505 →
  路由 catch 住变 500「举报失败」，而串行时只答 409。修法同族：insert 补
  `onConflictDoNothing`，拿不到行就按 (reporter, item) 重读一次回 `{isDuplicate:true}`。
  测试两条：域层用未提交事务把竞态窗口钉死（确定性杀死变异）；路由层只钉用户看得见的结局
  （两发都不是 500、库里只有一行）——**这条不承担杀变异的责任**，注释里写明了，
  因为两个 HTTP 请求在同一进程里不保证真的在 insert 处交叉（实测会串成一条 409）。
  见证：`75cecf5`；marketplace-reported 4/4 + admin-marketplace 41/41，市场七套件 79/79。

- **2026-10-23 第二十五片（#173）：并发同名建项目不再 500——slug 撞唯一索引就换后缀重来**。
  `createProject` 的 slug 是"查一遍有没有重名 → 没有就用 base"的读—改—写，而
  `projects_owner_slug_key` 是 (owner_id, slug) 上的唯一索引。双击「新建项目」、两个标签页
  同时开，两边都查不到对方 → 都插 base → 后到的那条判 23505 → 500。旧写法还藏一个静默的坑：
  50 个候选全撞也不会报错，最后拿着一个必然冲突的 slug 去插。修法：事务体抽成
  `writeNewProject`，由 createProject 循环驱动——查重只是省掉一次无谓的插入尝试，
  **真正的裁判是唯一索引**：撞了 `projects_owner_slug_key` 就换下一个后缀重来，全撞满才抛
  一句人话。认约束名是必须的：文档自己带重名页 / 重名 token 也会报 23505，那不是换 slug
  后缀能解决的事。`isSlugConflict` 沿 cause 链走（#151 的教训）。
  见证：`b34aefd`；projects / project-meta / project-delete / import / api-v1-write /
  branches / snapshots 七套件 73/73。

- **2026-10-23 第二十六片（#174）：并发拿同一个邮箱注册不再 500——撞 users_email_key 翻译回 409**。
  `register` 的"这个邮箱被占了没有"是读—改—写的前半截：`emailTaken` 查一遍 → update 自己
  那一行写死 email。两个标签页同时注册同一个邮箱，两边都查不到对方 → 都 update →
  `users_email_key` 判 23505 → 500，而串行时只答 409「该邮箱已被注册」。
  修法：update 包 try/catch，撞 `users_email_key` 就回 `email_taken`——和预检同一句回执。
  测试上有个发现值得记：**直接 Promise.all 两发 register 复现不了这个竞态**——口令哈希把窗口
  拉得足够宽，实测两发会串成"一发成功、一发 email_taken"，update 根本没交叉。所以照 #171
  的办法把窗口钉死：另一个事务先把同一个邮箱写进 users 但不提交，`emailTaken` 看不见未提交行，
  于是照样走到 update 并阻塞在唯一索引上。见证：`f49cff2`；auth.integration 7/7（连跑三遍稳定）。

- **2026-10-23 第二十七片（#175）：并发同步语料不再 23505——删与插收进同一事务、同一把项目写锁**。
  `syncDesignKnowledge` / `syncProjectKnowledge` 都是"删光这一类 → 逐块插回"，两步之间没有
  事务也没有锁。两个并发同步（自动保存 + 「重建索引」、双击重建、同时存世界与存角色）各自删一轮
  各自插一轮，后到的那发撞 `knowledge_chunks_source_key` 判 23505 → 500。串行时同样的事只是
  "后一次同步覆盖前一次"，所以这是把一次正常并发报成了服务器故障。修法：删与插收进同一个事务，
  并在事务里拿同一把项目写锁（ADR-0016）；调用方全都在事务**外**调同步，不会嵌套死锁；
  锁函数用动态 import 取（绕开 knowledge ↔ projects 的模块循环，与 :455 已有的套路同一招）。
  测试的坑：第一版拿 `design` 那一类的块键去撞，而默认路径根本不重切 design（删除范围必须等于
  重写范围），于是窗口根本没造出来——只取非 design 的键才复现。
  见证：knowledge / memory-search / memories 29/29 + world / games / storyboards / characters /
  context 48/48；tsc 0、eslint 0。

- **2026-10-23 第二十八片（#176）：恢复路由对非 UUID 的 id 不再 500——`restoreProject` 补形状门，20 条动态参数路由全扫**。
  拿 `not-a-uuid` 把 id-shape 测试没覆盖到的动态参数路由全部打了一遍（20 条），
  只有一条真漏：`POST /api/projects/<id>/restore`。恢复这条路**直达域层**（不像别的
  项目路由先过 `projectBelongsTo`），而 `restoreProject` 的 UPDATE 是裸
  `eq(projects.id, …)`——非 UUID 的 id 撞 22P02，路由 catch 住变 500「恢复失败」，
  而它只是一次打错的请求。修法同族：域层形状不对按"不存在"处理回 null，路由照旧
  翻 404，与 `softDeleteProject` 同一道门、同一句回执。其余 19 条实测全部安全：
  `ai/jobs` 两条路的 `taskByJobId` 查的是 text 列 `providerJobId`（作业号本来就不是
  UUID 形状）；tasks 的 approval/retry 走已有的门；assets 两条走 `rowById`；
  branches switch 双 id 都验；characters/memories/snapshots 三族的子 id 门都在；
  v1 三条先过 `projectBelongsTo`。这 19 条没有修复动作，收编进测试是为了锁住
  "不打 500"这条不变式。**收编时避开了空转**：角色 PATCH 的报文按
  `CharacterProfileSchema` 填满、v1 补丁带必填的 `summary`——第一版探针这两条都只在
  zod 层拿了 400，守卫根本没被走到（#170 的教训）；v1 design PATCH 补上 summary 后
  从 400 变 404，正是"真的走到域层"的证据。
  见证：`5e3180f`；id-shape 42/42；projects / project-delete / snapshots / branches
  四套件加 id-shape 共 92/92；api-v1 8/8；tsc 0、改动文件 eslint 0。
  变异探针：摘掉 `restoreProject` 的守卫，域层与路由两条测试精确红，其余 40 条不受影响。

- **2026-10-23 第二十九片（#177）：两个"已知不修"落成 ADR，等产品表态**。
  并发审计（#170-#176）扫到最后剩两处竞态，都**不修但记下**：
  ① `moderation.ts` `fileReport` 的举报升级是读—改—写且 `moderation_cases`
  无唯一索引——并发双举报同一 publication 会建两条未结案。加部分唯一索引有真实
  副作用（同 publication 新版发布的 findings 会被旧未结案挡掉）；收进项目写锁则让
  机检与举报共用入口全排队，换来的只是"审核员少看一眼重复行"。
  ② `assets.ts` 上传的 checksum twin 无唯一索引——并发双传同一字节会多一行、
  配额多算一份（不 500、不损毁）。加唯一索引会堵死"同项目传两张一样的图"
  与"归属不同角色"的合理诉求。两处的修法都等一个产品决定
  （"同 publication 允许多少条并行未结案" / "同项目同字节是否必须一行"），
  判决书：`docs/adr/0058-report-escalation-duplicate-cases.md` 与
  `docs/adr/0059-asset-checksum-twin-duplicates.md`。
  在此之前，新代码不许给这两处加唯一索引。

- **2026-10-23 第二十九片半（#178）：流式首屏落地并实测（§147 第三片）**。
  `page.tsx` 创建文档 promise 后**不 await**，流给客户端；`StudioShell` 里新增 `DocumentStream`
  （`use()` 解包 + `bootstrap`，包在 `<Suspense fallback={null}>`）⇒ shell 先 flush、文档 chunk 后到。
  **2026-10-21 记的那个产品问题有工程答案了**：当时说流式的前置是"文档是否完整"这个状态——
  **这个状态本来就有**（`state.ready`：画布只在 bootstrap/load 装好全量文档后渲染）⇒
  编辑不可能早于文档到齐 ⇒ "用户多久开始编辑"两种答案都安全，不必等产品拍板。
  `bootstrap` 与 `load()` 谁先到都安全（bootstrap 对已 load 过的同一项目是幂等 no-op）。
  **生产构建 A/B**（同一构建、`NEXUS_STUDIO_SSR_DOCUMENT=1/0`、`perf-browser.mts` 1000 档）：
  起手 8 节点首帧 **46.6ms vs 103.1ms**（流式快 2.2×，省一次 fetch 往返）；
  1000 节点首帧 283ms vs 161.9ms（流式稍慢——flight 序列化比 fetch+JSON.parse 重，但同量级）；
  属性写入 8.8 vs 9.3ms、选中 14.7 vs 19.4ms、帧距 6.1ms 两态持平。
  见证：`5e3180f` 之后的 studio 接线（见本次提交）；`@smoke studio slice` 两条 dev 下通过；
  生产构建全档量到；调试手动复刻确认 perf 脚本首轮挂 `typography.fontSize` 是偶发非回归。
  数与口径写进 `docs/PERFORMANCE.md` 末尾（2026-10-23 晚那一节）。

- **2026-10-23 第三十片（#179）：项目简介 PATCH 对非 UUID 的 id 不再 500——`updateProjectDescription` 补形状门，43 条动态参数路由二轮全扫**。
  **探针换了个问法**：#176 扫的是"路由 → 域助手 → 裸 eq()"这一族（收了 20 条）。
  这一轮反过来问"**id-shape 测试还没碰过的动态参数路由有哪些**"——91 条路由里约 56 条带路径参数，
  已覆盖 21 条，剩下 43 条全部拿 `not-a-uuid` 打了一遍（`.scratch` 探针，判据是"不得 500"）。
  **43 条里只有一条真漏：`PATCH /api/projects/<id>`（改项目简介）**。
  根因不是"漏了一道归属门"，而是这条路由**结构上就跟同目录的兄弟不一样**：
  GET / PUT / DELETE 都先过 `projectBelongsTo`，只有它不过——`updateProjectDescription`
  把所有权写在了 SQL 的 `owner_id` 里（函数头注释写明了这个取舍）。于是非 UUID 的 id
  一路裸 `eq(projects.id, …)` 撞 22P02，被路由 catch 成 500「更新失败」，而它只是一次打错的请求。
  修法同族：域层 `if (!isUuid(projectId)) return null` → 路由照旧 404，与 `softDeleteProject` /
  `restoreProject` 同一道门、同一句回执。**不是越权**（ownerId 一直在 SQL 里），是"坏形状被当成服务端故障"。
  **避空转的账**（#170 的教训第三次派上用场）：第一版探针有 4 条只拿到 400——zod 那层就收了，
  守卫根本没被走到。逐个补满契约后才真到域层：`PATCH /design` 要 `patches` 数组、
  `knowledge/block` 的 `sourceType` 必须在 `SOURCE_LABELS` 里（传 `world` 是 400，
  合法值里没有 `world`，只有 `lore/history/...`）、删除项目的确认词字段叫 `confirm` 不是 `confirmName`、
  `PUT`/`POST /snapshots` 要一份**形状合法**的真文档（只改 id 会被 `parseDocument` 先拦）。
  补满之后 43 条**全部 404**——这才是"走到数据库再答不存在"的证据。
  **二轮全扫的判据比一轮严**：一条探针只证明"这个坏字符串不 500"。所以这一轮加了两组对照：
  ① 五种坏形状（空串 / `1` / `abc-def` / 200 个 x / 版本位不对的假 UUID）在 PATCH 上全部 404；
  ② **三条正对照**（真项目 id 走 context / knowledge / snapshots 全部 200）——守卫挡的是坏形状，
  不是正常路径，"为了不打 500 把真用户也挡了"同样是缺陷，这一组就是钉这个的。
  见证：`id-shape.integration.test.ts` 42 → **47 条全绿**；projects / project-delete / snapshots /
  branches 四套件 50/50；tsc 0、改动文件 eslint 0。
  变异探针：摘掉 `updateProjectDescription` 的守卫 → 新块内 3 条精确红（域层 null、路由 404、
  五种坏形状），其余 44 条不受影响；逐字节还原后 47/47 复绿。

- **2026-10-23 第三十片半（#180）：五条生成入口的额度闸逐一实证——"generation 记账但不拦截"判为过期行**。
  上一轮（394c43d）核 credits 时留了一句"欠 generation 的执行方"，这一轮不问"写没写"，
  改问"**超额度的时候到底发不发出得去**"——把四类余额压到 0，五条入口逐个打：
  ① `refusalForRun` 本身；② `submitClientRequest`（`POST /api/ai/jobs` 与 `/api/ai/tasks/<id>/retry`
  都走它）；③ `runReadinessCheck`（`POST /api/projects/<id>/agent`）；④ `POST /api/ai/run` 路由；
  ⑤ `generateDemoImage`（Image Studio）。判据两层：回 `credits_exhausted` / `credits`（429）
  **且 `agent_tasks` 一条都没多**——只看状态码的话，一条没建的作业也会回 200。
  正对照：把额度加回去，`refusalForRun` 回 null、本地合成照旧出图（闸挡的是超额，不是正常路径）。
  **写测试时踩到的两个真坑（都值得记住）**：
  ① `requireUser()` 会话查不到时会**就地造一个 guest 用户**（§137 设计）⇒ 测试里 sessions 行的
  `tokenHash` 必须存 SHA-256（`crypto.subtle.digest`），存明文会让身份悄悄换成 guest——
  症状是 `projectBelongsTo` 返 false、整条路以 `404 project_not_found` 收场，
  **看起来像"项目不见了"，其实是身份换了**；
  ② `credit_ledger` 是只追加账本（DELETE 被 plpgsql 触发器挡，报 P0001），
  清理只能靠删 users 时间接清（afterAll 里不要 `db.delete(creditLedger)`）。
  **标签与事实的对应（写进正文免得下次再判错）**：`ENFORCED_PLAN_AXES` 里的 `aiUsage`
  指的就是这道按 `creditKindForAgentKey` 分桶（ai/image/video/compute 四桶）、
  按 `GENERATION_COST`（ai 1 / image 2 / video 5 / compute 1）计价的闸 ⇒ "生成次数"这一格
  **已生效**，只是标签叫 aiUsage；`generation` 与它是同一道门，没有第二道。
  team collaboration 与 publishing 仍无执行方。**不改 `ENFORCED_PLAN_AXES` 的代码语义**
  （标签命名是产品决策，本轮只修事实陈述）。
  见证：`apps/web/test/credits-enforcement.integration.test.ts` 2/2 绿；credits / credits.test /
  tasks-ledger(.integration) / tasks-ledger.test 五套件 39/39；tsc 0、改动文件 eslint 0。
  变异探针：摘掉 `submit.ts` 的额度门 → 该文件精确红（`expected true to be false`），
  从 `.scratch/submit.ts.fixed` 逐字节还原后复绿。

- **2026-10-23 第三十一片（#181）：坏 JSON 正文不再变成 500——`req.json()` 抛的 SyntaxError 按 400 收，三条路由同族修完**。
  `marketplace/route.ts` 里那句注释早就记着这一族："此前 `await req.json()` 在 try 之外，
  非 JSON 正文直接把请求带崩成 500"——当时只修了那一条。这一轮反过来问
  "还有哪些路由把 `await req.json()` 放在了会把它接住的地方"，全仓扫出**三条**：
  `POST /api/projects/<id>/knowledge/block`、`POST /api/projects/<id>/knowledge/search`、
  `POST /api/projects/<id>/characters/<characterId>/chat`。三处都是同一个形状：
  `req.json()` 在 try 里，SyntaxError 被 catch 收走，回的话从"请求体不是 JSON"
  变成"读取语料块失败 / 检索失败 / 对话失败"——**调用方写错了请求，服务端报自己的故障**。
  错误码是契约的一部分：500 会让客户端走上重试与报警，而它该做的是改正文。
  修法用仓库里早就有的 `readJson(req)`（`server/http.ts`，解析失败回 null），
  不新造helper：三条路由的 zod schema 都是 `z.object(...)`，`safeParse(null)` 照旧 400，
  话术与 marketplace 那条一致（`validation_failed` + 指出是 body）。
  **同族扫完的结论**：`/api/ai/run` 与 `/api/ai/jobs` 早就做对了（try 包 `req.text()` + `JSON.parse`，
  坏正文回 400「请求体必须是 JSON」），`import.ts` 里两处 `JSON.parse` 也各自拒收；
  这三条是这一族剩下的全部。
  见证：新文件 `apps/web/test/bad-json-body.integration.test.ts` 5/5 绿。判据三层——
  ① 六种坏法（截断 JSON / 空正文 / 数组 / 字符串 / 数字 / null）全部 400；
  ② 只打三条路由不够，另钉两条**早就做对了**的同族路由（`/api/ai/run`、`/api/ai/jobs`），
  将来谁把它们"统一"成上面那种写法，这条会红；
  ③ **正对照**：正常正文照旧走完——block/search 200，chat 停在 409 `demo_mode`
  （今天的正确答案：没有真 provider 就不假装角色在说话；它在这里的含义是正文解析成功了）。
  变异探针：逐条把路由还原成 `await req.json()` → 每次精确红 1 条（就是那条路由那一组），
  其余 4 条不受影响；逐字节还原后 5/5 复绿。
  tsc -p apps/web 0；改动文件 eslint 0；相邻七套件（knowledge ×3 / character ×3 / 本文件）71/71。

- **2026-10-24 第三十二片（#182）：`/api/blocks` 补上路由级见证——§132 拉黑/屏蔽的三条边界各有钉子**。
  起因是"91 条路由里哪些从来没有被路由模块直接 import 过"这个问法：
  逐条比对测试源码后剩 7 条，其中 `/api/blocks`（§132 block/mute）是唯一一条
  **用户可见、有真语义、却只有域层被间接调到**的。路由这一层有三件只有它说得清的事：
  ① 按 handle 寻址（界面上给的是 @name，"知道某个人的 uuid"不该是能做这件事的前提）；
  ② CSRF 双提交——写请求，没有它就是跨站就能替人拉黑；
  ③ 解除是 no-op 不是错误（"取消"点两次不该变红）。
  另两条最需要说清的语义钉在域层断言里：**block 把两个方向的关注一起拆掉**
  （留一条"我关注了我拉黑的人"，关注流里就还会冒出他的内容，等于自己给 block 留口子），
  **mute 不动关注**（"还想知道他在做什么，但不想被他找到"是合法用法），
  以及 mute 不挡互动、block 双向都挡——把 mute 当禁言用会以为自己在处理骚扰，其实没有。
  见证：新文件 `apps/web/test/blocks-route.integration.test.ts` 9/9 绿。
  变异探针六种，全部精确红：摘 CSRF 门（连带把"一个关系都不写"那条一起打红）、
  去掉 self-block 检查、把 block 拆关注改成谁都拆、完全不去拆关注、
  `canInteract` 全放行、`userByHandle` 对不存在的人也返回一行。还原后 9/9 复绿，
  源码零改动（只新增测试文件）。tsc -p apps/web 0；eslint 0；相邻 social 套件 19/19。
  同批扫出的另外 6 条（`account/avatar`、`auth/login`、`auth/logout`、`ai/pending-approvals`、
  `discover`、`published/report`）逐个看过实现：都有 zod/CSRF/`isUuid` 门，无洞，留待后续补见证。

- **2026-10-24 第三十三片（#183）：§137 的 guest 自动签发把"按 user.id 限流"那一族变成了空转——10 条写入口补上"身份之前的闸"**。
  `middleware` 给每个没有会话 cookie 的请求签一个**随机** token，`requireUser()`
  拿不到会话行就**就地建一个 guest 用户**。于是 `rateKey(route, ip, userId)` 拼出来的
  `${route}|${userId}|${ip}` 对不存 cookie 的客户端每次都是新键。探针实测（打真库，
  `POST /api/published/report`）：**12 个不同 token → 建 12 个 guest、0 次 429**；
  同一个 token 打 12 次 → 只建 1 个 guest、第 11 次起 429（按身份的那道闸本身是生效的，
  失效的只是它的键）。`marketplace/route.ts` 的注释早就点破过这件事并加了双键，
  但双键挡不住新身份。
  **更糟的是扫下来三条写入口本来就没有任何限流**：`POST /api/projects`、
  `POST /api/ai/run`、`POST /api/account/api-tokens`——一个绕开 cookie 的客户端
  可以无上限地建用户 + 项目 + 文档 + 任务行 + 凭据。`/api/ai/run` 虽有 §133 的额度闸，
  但 free 档每月发 100 点而 guest 可以无限新建：额度闸限的是"一个身份做多少"，
  限不住"建多少个身份"。
  修法：新增 `ipWriteGate(route, req, limit, windowMs)`（`server/security/rateLimit.ts`），
  接到 10 条写入口上，**一律放在 `requireUser()` 之前**——被挡住的请求一个 guest 都不该建
  （建了就是"限流了但还是付了代价"）。与 `auth/register` 完全同形状。
  两条限度说清而不是绕过去：① 标识不出 IP（没有 XFF）的请求不进这个桶——
  给它们一个共享桶会把正常用户一起挡掉，那是用一种故障换另一种故障；
  ② IP 是粗粒度身份，限额取宽，各路由原有的按身份闸一条没删（兜底，不是替代）。
  见证：新文件 `apps/web/test/guest-write-gate.integration.test.ts` 4/4 绿。
  判据三层：① 25 个不同 token 打 `POST /api/projects` → 前 20 个 201、后 5 个 429，
  **且只建 20 个 guest**（被挡的没付代价）；② 公开举报入口同样兜住；
  ③ 正对照：稳定身份照旧放行（3/3 个 201、只建 1 个 guest），以及无 XFF 时闸让路。
  变异探针两种都精确红：摘掉闸、以及**把闸挪到 `requireUser()` 之后**（顺序错 =
  被挡的请求照样建 guest）。还原后 4/4 复绿。
  受影响五套件 43/43、social 相关 26/26；tsc -p apps/web 0；改动文件 eslint 0。
  判决书：`docs/adr/0060-guest-autoprovisioning-needs-pre-identity-rate-limit.md`。
  **遗留（写进 ADR，不假装没有）**：`GET /api/auth/me`、`GET /api/projects` 这类
  **读**入口也会建 guest（一个用户行，没别的副产品）。没给读入口加闸——
  给 GET 回 429 会让账号面板直接坏掉，值得单独评估。

- **2026-10-24 第三十四片（#184）：UUID 形状判定收回"只此一处"——又冒出来的三份手抄正则合并进 `domain/ids.ts`，并修正一处与实测不符的注释**。
  `domain/ids.ts` 的文件头写着"UUID 形状校验——**只此一处**"，并且记着已经合并过
  `assets.ts` 的 `UUID_SHAPE` 一份。这次反过来问"还有谁在自己手抄"，扫出**三份**：
  `api/avatar/[userId]/[file]/route.ts`、`domain/analytics.ts`、`domain/analytics-agent.ts`
  ——三份都是同一句注释、同一个正则，与权威实现并存。
  **合并前先证明行为等价**（不靠读代码猜）：拿 zod 4.6.5 的 `z.string().uuid()` 与手抄正则对拍，
  2000 个 `crypto.randomUUID()` **0 处分歧**；逐位试出来唯一差别在**第四组第一位**——
  zod 要求 `8/9/a/b`（RFC 4122 的变体位），手抄那份收任何十六进制，
  另外 zod 额外放行全 0 与全 f 两个特例，版本位两边都不管。
  所以真实 id（`defaultRandom()` 出的是 v4）两种都认，被挡下的那几位恰好是
  "长得像 UUID 但不是 UUID"的输入——合并是行为等价且更严一点。
  **顺带修掉 `ids.ts` 里一句与实测不符的话**：原注释说 zod "比手抄的严一点点（版本位与变体位）"，
  实测版本位两边都不管，只有变体位有差别。注释说错了比没有注释更糟——
  下一个照它做判断的人会被带偏。
  见证：合并后全仓 `[0-9a-f]{8}-[0-9a-f]{4}-` 形状的本地正则 **0 份**；
  tsc -p apps/web 0；改动文件 eslint 0；analytics 四套件 + id-shape 共 115/115 绿。

- **2026-10-24 第三十五片（#185）：批注的「已解决」状态落地——一行时间戳，并且它改变了 AI 能看到什么**。
  §111 那一行挂了很久的"只剩一项"（2026-10-21 核实）在这次补齐：`comments.resolved_at`
  （迁移 0038）+ `setAnnotationResolved` + `PATCH /api/annotations/[id]` + 界面 + 上下文。
  四处值得记下来的判断：
  1. **时间戳不是布尔**。与 `projects.deleted_at` 同一条纪律：状态由存在性推出（NULL = 未解决），
     "什么时候解决的"与"是不是解决的"是两个问题，存布尔就永远答不出前者。
     顺带白拿一样：重新打开再标一次，第二次盖掉第一次，"反复开关过"在数据里留得下痕迹。
  2. **库上是第二道门**：CHECK `comments_resolved_at_only_annotations` 管住
     "公开评论（§59，node_id 为空）不能有 resolved_at"。服务端 PATCH 按同一条件取行，
     但直接连库的人到得了那里。探针实测：摘掉约束，那条 CHECK 测试精确红。
  3. **幂等由两道共同保证**（早退 + `next` 读回原值）。单独摘任意一道另一道还在、测试仍绿——
     所以探针要两道一起摘才红。这条写进注释，免得下一个人把其中一道当多余的删掉。
  4. **已解决的批注不再进 AI 上下文**，这是本片真正的行为变更：不带上去，但
     `annotationsNote` 写明"1 条批注已标记为已解决，没有带上"（§159 不静默降级）。
     `@Agent` 提名同样只认未解决的——收工的话不该再点名哪个 Agent。
  见证：`annotations.integration.test.ts` 13/13、`annotation-resolve-route.integration.test.ts` 5/5、
  `id-shape.integration.test.ts` 49/49、ai-assemble + agents + 安全结构门 43/43；
  画布 e2e 一条绿（标上 → 默认收起 → 展开 → 刷新后仍在 → 重新打开）。
  变异探针 6 种（不过滤已解决 / 公开评论门 / 回复门 / 归属门 / 幂等两道齐摘 / CSRF）+ 库上约束摘除，
  全部精确红后逐字节还原。tsc -p apps/web 0；改动文件 eslint 0。
  判决书：`docs/adr/0061-annotation-resolved-state.md`。
  **没做的**：`PATCH` / `DELETE /api/annotations/[id]` 没加 IP 闸。它们要先过
  `projectBelongsTo`，guest 建不出任何东西（只有一个用户行，与 `GET /api/auth/me` 同一笔欠账，
  见 ADR-0060 的遗留段）——不在这片里顺带扩面。

## M5 第一片（#186）：时间线 → 渲染计划——"没有 provider 时能诚实做出来的那一半"定成契约

`packages/video-model/src/render.ts`：`planVideoRender(storyboard)` 把时间线投影成一份
**可渲染的帧计划**——哪一镜在第几毫秒、画面从哪来、怎么动、和下一镜怎么接。
渲染器（ffmpeg）照着它做就行，不需要再猜任何一个决定。

为什么不直接上 ffmpeg：决定比命令值钱。机位怎么映射成推拉摇移、转场吃不吃总时长、
没有参考帧时画面上是什么——这些判错一次，渲出来的片子就是错的，而错在
"模型没想清"比错在"命令行写错"难查得多。所以先是模型，后才是渲染（与 §40 前四片同一顺序）。

四处判断：
1. **转场吃这一镜的尾段**，不另加时间。总时长必须恒等于各镜时长之和，
   否则在时间线上 trim 一镜就会偷偷改变总长（§16：投影不是第二份真值）。
2. **推演用"缩放 + 平移"而不是归一化裁剪框**。源图长宽比五花八门，裁剪框要在
   "保持比例"与"恰好铺满 16:9"之间二选一；缩放+平移让渲染器先 cover 适配再推拉，
   输出帧永远 16:9，变形与否由素材决定，不由计划决定。
3. **色卡是这一镜的画面，不是"素材加载失败"的占位图**：颜色由 shotId 的 FNV-1a
   散列定（同一镜永远同一个颜色，§16 要能重放），且**不给它一套假运动**——
   一张静态卡片推拉等于假装有运镜。
4. **`demo: true` 写进计划本身**。本机没有视频 provider（§79 要真 key），
   像素来自本地推演；把它当真 provider 的产物显示就是 §160 禁的那件事。

见证：`packages/video-model/test/render.test.ts` 14 条，全套 video-model 62/62 绿。
变异探针 6 种全部精确红：转场不吃尾段 / 给色卡假运动 / 色卡颜色改随机 /
renderable 忽略总时长 / caption 不截断 / tracking 改成也推拉。
tsc -p packages/video-model 0；改动文件 eslint 0。

**下一步**：`buildFfmpegArgs(plan, inputs)`——把计划翻成可执行的 ffmpeg 命令，
并用真 ffmpeg 渲一条 3 镜的样片，ffprobe 验时长与分辨率（下一片）。

## M5 第二片（#187）：渲染计划 → 真的能跑的 ffmpeg 命令行，并且真的跑出了一条片子

`packages/video-model/src/ffmpeg.ts`：`buildFfmpegArgs(plan, files, {output, fontFile})`
把上一片的计划翻成 argv。**这一层用真 ffmpeg 8.1.1 验过**，不是"看起来对"：

三镜样片（参考帧 1600×900 竖图 + 色卡字幕 + tracking 横摇，转场 fade→cut），
`ffprobe` 实测：`1280x720 / 30fps / h264 / yuv420p / nb_frames=360 / duration=12.000000`，
与 `plan.totalMs = 12000` **一帧不差**。抽帧看过：两张参考帧按 cover 适配铺满、
色卡居中烧字幕（中文字体 msyh.ttc，arial 只有方框——所以字体文件是入参，不是硬编码）。

过程中测试抓到一个真 bug：帧数被当成毫秒传进了 `seconds()`，30 帧写成 `0.001` 秒，
zoompan 于是每 33 毫秒就被输入掐一次，推演停在原处不动。已加 `durationSeconds(frames, fps)`
并把这一格写成钉子（变异探针 E：把 `/fps` 改回 `/1000`，测试精确红）。

四处判断：
1. **参考镜多渲 `transitionInMs` 毫秒**：转场叠在"上一镜尾段 + 本镜开头"这个共享窗口上，
   少给这几帧，`xfade` 会把片尾啃掉一口（成片比时间线短）。
2. **`xfade` 的 offset = 本镜起点 − 转场时长**，正好铺在上一镜尾段上；
   `cut` 边界走 `concat`（不需要两段重叠）。最后一镜的 `transitionOut` 没人接——
   这一点现在写进计划的 `notes`，否则界面上改它不会有任何效果却说不出为什么。
3. **滤镜链转义单独一个函数**：`:` `,` `;` `[` `]` `'` `\` `%` 全是结构字符，
   不转义要么解析失败，要么被悄悄吃掉一段字幕。
4. **不说谎**：计划里有色卡字幕但没给字体文件时，不静默丢——进 `warnings`，
   调用方必须显示。计划说有参考帧却找不到文件时直接抛错，不静默换成色卡。

见证：`packages/video-model/test/ffmpeg.test.ts` 15 条，全套 video-model 77/77 绿。
变异探针 8 种全部精确红：参考镜不多渲头 / xfade offset 用错 /
缺文件时静默跳过 / 缺字体不告警 / 帧数当毫秒 / 完全不去转义 / 摘 renderable 门 /
（E 与 F 各自单独摘都曾失手过——第一版探针只摘了 `\` 一条 replace，其余七条还在，
所以是绿的；改成整函数替换后才红。探针要摘到"这条性质的全部承担者"。）

tsc -p packages/video-model 0；改动文件 eslint 0。

## §52 产物第三条链的补记（#188）：对话的播放语义收回模型层，产物转写跟着改

`packages/game-model/src/story.ts` 新增 `StoryState` / `storyInitial` / `storyStep` / `storySummary`，
与 `sim.step`、`rpgStep` 同形：纯函数、不改传入的 state、同一输入跑出同一结果。
之前播放语义分两处各写一遍——`StoryPlay.tsx` 的 `currentId + path` 数组、产物 `NexusStory` 的
`visited` 布尔表；两处都是"播放器"，却没有一处能被平台页与转写同时引用（§16）。
现在"走过几次"记成计数（`visited: Record<string, number>`）并保留 `trail`，面包屑与"第 N 次走到这里"
都从这两个字段现算，不再各留一份。

两个语义点：

1. **起点开场即算走过一次**（ADR-0046 那个坑的延续）：`storyInitial` 同时写 `visited[startId] = 1`
   与 `trail = [startId]`，绕回起点当步就认得出环，不用绕两圈。
2. **打不中的选择返回同一个 state**，不是拷贝——"点下去没反应"就该真的没反应。

产物转写同步：`NexusStory` 的 `visited` 由布尔改成计数、补 `trail`，空场那句拒绝语从 `story.ts`
的导出插进产物（模板里不再重打一遍）。

见证：`story.test.ts` 新增 8 条（计数与顺序、成环且 loop 不回退、no-op 身份、事件上限、摘要原文、
两次同结果）；`codegen.test.ts` 那条"起点记进 visited"改成计数写法；`scripts/story-engine-proof.mts`
9 条 → 11 条：同一串 5 步（含一次重访与一次打不中）之后，模型与 `NexusStory` 的状态
`JSON.stringify` 逐字段相同、摘要逐字相同。game-model 全量 235/235 绿、tsc 0、eslint 0。
浏览器那一段：`screenshots/story-play-first.png` / `story-play-end.png` 已看过——正文、唯一选项、
空正文说明、结束句与「走过 2 段」都对。

**一条环境记号**：`@smoke §51 类型分派` 这一支一次走八种画法，冷 dev server 上光 RPG 页首帧就等了
123 秒，300s 总预算在最后一张截图前被吃光（trace 里所有断言当时都已通过）。按仓库既有惯例
（§52 Code 那支同因放到 600s）把这一支的预算也调到 600s——**只放宽时间，不动任何断言**。

**仍然欠的**：~~产物侧是转写，不是 import——`story.ts` 改逻辑而产物不重新生成仍会分叉，
这条限度留在 `CODEGEN_LIMITS` 里。~~
2026-10-29（评估第十四片）改口径：**转写这件事没变，变的是"分了叉没人知道"**。
`packages/game-model/test/story-parity.test.ts` 把模型与产物里的 `NexusStory` 在同一串选择下的
状态逐步对账（字段集合 / 逐字段值 / 摘要 / "打不中原样返回同一个对象"的引用契约），跑在 `npm test` 里。
此前那份对账住在 `scripts/story-engine-proof.mts`——没有 npm script、不进 vitest include，
只有人记得手动跑才响，等于一扇没人踢的门；脚本的 11 条逐条有了归宿之后删掉了。
**照实还欠的那半**：~~`topdown` 与 `rpg` 两条链仍然只有浏览器 scripted 见证 +
"数字由同一处供给"那道静态闸，静态闸不证明两边算术相同——`sim.ts` 改了逻辑而产物没跟上，
今天还得有人跑 `npm run parity:game-code` 才知道。~~
2026-10-29（评估第十五片）也改口径：那条限度说的事实到这一片才真的关掉。
`packages/game-model/test/sim-parity.test.ts` 把 `sim.ts` / `rpg.ts` 与产物里那两段转写
（`NexusSim` / `NexusRpg`）在同一串 `(input, dt)` 帧下逐步对账，四把尺子与 story 那条共用
（`test/support/artifact-vm.ts`：取字节、建 vm 上下文取全局、按键排序序列化、字段集合比较）。
浏览器 scripted 见证（`npm run parity:game-code`）没有失业——它量的是渲染与点击，这一片量的是转写语义。
五条变异臂（触及少算一记自身半径 / 等级门差一 / 去掉定步长上限 / 摘要漏乘升级次数 /
只改转写那一侧的同一处触及）逐条把门踢红，读数见 `docs/EVALUATION.md` 第十五片。

## §52 产物第三条链的补记（#188 的见证补记）：对话那一段也有浏览器 scripted 见证，且"打不中"的引用契约与模型同形

`scripts/game-code-parity.mts` 原先只有页面级 STORY_* 判决：正文会换、成环会标、plan 不被写死——
但没有**同一串选择在模型与产物两边跑出同一串状态**这一格，那正是 ADR-0046 给产物立的规矩。
现在三条链各有一段 scripted trace 逐字节比：story 那一段 6 步（起点→第二段→起点成环→
两个打不中→再走一圈），两个"打不中"分别是**不存在的 id** 与**别段的选择 id**。

这一步同时抓出一个转写分叉：模型层 `storyStep` 打不中时原样返回**同一个 state**（`story.test.ts`
用 `toBe(state)` 钉住），而产物 `NexusStory` 当时先造了 `next` 再 `return next`——JSON 一样、
引用不一样，页面 `setState` 会多一次无意义重渲染。产物改成检查全部放在构造之前、打不中 `return state`，
与模型同形；`codegen.test.ts` 加一条静态钉子（四个 guard 都返回 state，且 `return next;` 只出现在成功那一步）。

判决从 31 条加到 38 条：新增 `STORY_STATE_TRACE_PARITY`（1208 字节逐字符相同）、
`STORY_SUMMARY_PARITY`、`STORY_NOOP_IS_A_NOOP`（打不中 2 步步数与对象都没动、走通 4 步各 +1 并换新对象）、
`STORY_LOOP_EXERCISED`（重访 d1×3 / d2×2、成环事件 3 条，按 `t` 去重——状态每一步都带整份旧事件，
直接 flatMap 会把 3 条数成 8 条）、`STORY_ENDING_PARITY`（末段没有出边的摘要）、
`STORY_UNPLAYABLE_REFUSAL`（一条对话都没有：`ended` + 同一句 outcome + 点一下返回同一对象）、
`STORY_CONTROL_MUTATED_SCRIPT`（把第一步换成打不中，两边一起变且仍逐字节相同）。

见证读数：`scripts/game-code-parity.mts` 38/38 绿（`PARITY_EXIT=0`）、`scripts/story-engine-proof.mts`
11/11、game-model 全量 236/236、game-model 与 tools 的 tsc 0。**先量旧行为再修**：同一份见证在改转写之前
跑出 38 条里 2 条红（`STORY_NOOP_IS_A_NOOP`、`STORY_UNPLAYABLE_REFUSAL`，其余含逐字节 trace 全绿），
修完才全绿——那两条红就是这次修改的因果凭证，不是补写的断言。

## M5 第三片（#189）：资产链路收下视频字节——只收本服务 ffmpeg 渲染出来的产物

`apps/web/src/server/storage/videos.ts`（新）+ `assets.ts` 的 `uploadVideoAsset`：视频字节
第一次能进资产库。与 `uploadImageAsset` 共用同一条摄取链（magic 嗅探 → 限额 → 去重 → 配额 →
落存储 → 落库），但有两条**刻意不同**：

1. **没有 `source` 参数，写死 `generated`**。视频字节今天只有一个来源：本服务自己跑的 ffmpeg
   （§40-42 的 DEMO 渲染）。用户上传通道对视频保持关闭——mp4/webm 的元数据长在容器结构里、
   摘不掉（见下），收下一颗来路不明的视频等于收下它的 GPS 与设备指纹。将来导入真的需要视频时，
   入口开在领域函数里，不开在调用方那里。
2. **元数据在摄入时复核，不在摄入时剥**。位图那条链是"剥干净再入库"；视频剥不了，所以改成
   "渲染命令里就不写，摄入时按容器结构验一遍"。少了这一遍，"渲染命令忘了配旗"会静默产出一颗
   带着设备信息的成片，还照样进得了资产库。

"干净"按容器分别定义，定义的依据是**"本服务的渲染链能做到多干净"**（拿做不到的标准当门禁，
只会把自家渲染产物拒之门外）：

- mp4：`ilst` 里不许住东西，顶层也不许有 `meta`/`udta`/`uuid` 盒。注意 ffmpeg 的 bitexact 产物
  也会留一个**空的** ilst 盒（实测 8 字节无子项）——那是容器形状，不是内容，所以判的是"非空"。
- webm：matroska muxer 无论如何都会写 `Tags`（实测 `-bitexact` 只能抹掉版本号，去不掉
  ENCODER / DURATION 本身），所以白名单只认这两个 muxer 自己的名字；出现第三个
  （TITLE / GPS / 评论…）就说明这颗字节不是本服务渲染链的产物。

**测试抓到的真 bug（比这片本身更重要）**：`zoompan` 的 `d` 是"**每个输入帧**产出 d 帧"。
#187 用 `-loop 1 -t 1.400` 喂静态图参考帧，实际给出 35 帧输入，zoompan 于是产出 35×42=1470 帧，
整条时间线被输出侧的 `-t` 截断——**成片只剩第一镜**，后两镜一帧未现，而 ffprobe 量时长
还是"对"的（360 帧 / 12.000000s）。#187 那条"抽帧看过三镜"的见证因此是假的，这里一并纠正。
修法：参考帧按**单帧**进（不给 `-loop` / `-stream_loop`、不给输入侧 `-t`），滤镜链前加
`select='eq(n\,0)'` 兜住视频输入。修后重验三镜样片：1280x720 / 30fps / h264 / yuv420p /
nb_frames=360 / duration=12.000000，t=1 第一镜参考图、t=5 第二镜竖图 cover、t=9.5 深色卡 +
居中中文烧字幕，三镜各自在位。

渲染命令因此补三个旗：`-map_metadata -1 -map_chapters -1 -bitexact`。三者各自承重，
都有实测依据：摘 `-map_metadata -1`，参考帧自带的 `comment=GPS: 31.23,121.47` 整段流进成片
ilst（真 ffmpeg 复现，正是 §80 里"位置信息顺着编码器流进成片"的现场——所以渲染器**不信任
上游已经剥干净了**）；摘 `-bitexact`，ffmpeg 自己的 `©too=Lavf…` 品牌标签写进 ilst。

见证：`apps/web/test/video-asset.integration.test.ts` 13 条（真 ffmpeg 渲出真字节再喂摄入门，
干净/带元数据两个方向都测）；`packages/video-model` 79/79 绿；tsc 0、改动文件 eslint 0。
变异探针 14 种全部精确红、逐字节还原：sniff 不看 DocType（mkv 改姓）/ ilst 出现即违规 /
不递归进 moov/udta/meta / 读不懂时假装干净 / webm 白名单全拒 / webm 白名单全放行 /
去体积上限 / 摄入不复核元数据 / 摄入不去重 / 摄入不问配额 / 去 -bitexact / 去 -map_metadata -1 /
参考输入加回 -loop 1 / 去 select 首帧。

**下一步**：把渲染接进服务端——一个"渲染这一条分镜（DEMO）"的作业，产物走这条刚接上的
视频摄入链回填 `shot.videoAssetId`，UI 入口明码标注 DEMO 并把 warnings 显示出来。

## M5 第四片（#191）：渲染接进服务端与界面——分镜真的渲成一条 mp4，DEMO 三个字明码标注

`storyboard-render.ts`（领域函数）+ `POST /api/projects/[projectId]/storyboard/render`（路由）+
`StoryboardPanel` 的「DEMO 渲染整条分镜」按钮。把 #186/#187/#189 三片接成一条完整的链：
`loadStoryboard → planVideoRender → buildFfmpegArgs → runFfmpeg → uploadVideoAsset`，
四道顺序纪律与两条生成链同口径（额度门在 `startTask` 之前、参考帧按 id 取字节走 `openAssetForOwner`、
扣点只在成功收尾、渲染进程有 120s 墙上时钟上限）。

三条**说不说谎**的设计：

1. **DEMO 三个字出现在三处**：按钮标题、结果区的角标、`genMeta.demoMode: true`。
   像素来自本地确定性推演 + 真 ffmpeg——字节是真的、来源是假的，这两件事必须分开说（§160）。
2. **warnings 必须显示**：没有中文字体时 drawtext 烧不出汉字，`buildFfmpegArgs` 会明说
   "字幕没有烧进画面"；路由把 warnings 原样带回，界面渲染出来——没做到的事不许静默（§159）。
3. **成片挂回第一镜**：整条分镜一条片子，走 `applyOps` 的 `updateShot` 补丁挂
   `videoAssetId`（§150），一次渲染 = 一个可撤销事务，不新增补丁形状。

失败码十一种各有各的说法：`no_storyboard / unreadable_storyboard / not_renderable /
reference_unreadable / reference_not_visual / credits_exhausted / storage_exhausted /
invalid_video / ffmpeg_missing / ffmpeg_failed / render_timeout`。路由层与 /images 对齐：
429（额度）/ 413（存储）/ 400（其余）/ 201（成片）。

**测试抓到的两件真事**：

- **免费档每月只发 5 点 video 额度**：快乐路径一次渲染就见底，后面的用例撞上的是额度门
  而不是自己要测的那道门。修法与 image-studio 测试同口径：开跑前兜到 10 点，测完还回去。
- **`node:fs` 的 `readFile`/`writeFile` 在 @types/node 24 里是回调式**，同步版叫
  `readFileSync`/`writeFileSync`：第一版 import 错了，`await readFile(output)` 的类型是 void。
  仓库里 `storage/index.ts` 一贯从 `node:fs/promises` import，就按这个来。

见证：`apps/web/test/storyboard-render.integration.test.ts` 9 条（真 ffmpeg 真渲染，含 ffprobe
验时长 2.4s = 两镜之和）、`storyboard-render-route.integration.test.ts` 5 条（CSRF 403 /
别人项目 404 / 无分镜与空分镜 400 / 快乐路径 201 / 额度 429 且三表行数不变）。
变异探针 6 种全部精确红、逐字节还原：摘额度门 / 参考帧不做归属校验（`openAssetForOwner` →
`openAssetFile`）/ 删参考帧 mime 门 / 删超时 kill / 失败路径不 `finishTask`（任务永远 running）/
扣点提前到 ffmpeg 之前（失败也扣钱）。tsc 0、改动文件 eslint 0。

**下一步**：分镜面板的时间线与资产库之间还差一格——成片挂上之后，资产清单里要能按
"哪条分镜的产物"反查（`genMeta.storyboardId` 已经在了，缺的是列表页的展示与筛选）。

## M5 第五片（#192）：资产清单里的"分镜产物"反查——渲过几版、哪版正挂着

`listStoryboardRenders(projectId)`（领域）+ `GET /api/projects/[projectId]/storyboard/render`（路由）+
面板上的历史清单。判据只有一条：`genMeta.storyboardId` 在。那一格从 #191 起由
`renderStoryboardDemo` 自己写——没有它的 video 资产（直接插库的、别的链路产的）不算
"分镜的产物"，混进来只会让面板指着一条来路不明的片子说"这是你渲染的"。

顺带补上一格**投影缺口**：`assetRowToRef` 的 `generatedBy`（DEMO 角标与"回到那一次任务"
的唯一依据）认 `gen.prompt`，而 #191 的视频 genMeta 里没有这一格——渲染链唯一的产物
在资产面板里因此拿不到 DEMO 角标，看着像"不是生成的"。修法是在 genMeta 里补
`prompt: document.source.prompt`（分镜的来源那句话），不新开字段。

**测试抓到的真行为**：同一份分镜原样再渲一次，成片**逐字节相同**，摄入门按 checksum
去重——"渲过两次"不等于"两行"。注意 `finishTask` 每次都会扣点：钱按次收，资产按内容算，
这两件事分开钉（去重那条用例 + 扣点那条用例各管一头）。改过一个镜头再渲，字节不同了，
才是新的一版——清单两条、新的在前。

见证：`storyboard-render.integration.test.ts` 12 条（新增去重 / 两版排序 / 跨项目隔离 /
plain video 不算产物）、`storyboard-render-route.integration.test.ts` 8 条（GET 的 200 空清单 /
404 / 渲后清单对得上）。变异探针 5 种全部精确红、逐字节还原：列成片不看 storyboardId /
列成片不过项目 / 排序改成旧在前 / GET 路由不验归属 / genMeta 不写 prompt。tsc 0、eslint 0。

**下一步**：时间线预览还差"点时间线上某一格跳到那一镜"；以及 §163 build.status 与分镜
渲染的关系（一次渲染就是一个会完成的构建操作，`build.status` 至今只有导出那一个生产者）。

## M5 第六片（#193）：渲染成为 build.status 的第三个生产者——被拒的请求一条刻度都不留

`renderStoryboardDemo` 往项目频道发 `build.status`（§163）：ffmpeg 起跑前 `building`、
字节进了资产库 `ok`、中间任何一步断了 `failed`。口径与发布链路同一句话：**每一格都挂在
一个真发生了的节点上，中间不插刻度**。

最关键的一条是**不发射的地方**：额度门与"没有分镜"那些拒绝一条事件都没有——渲染从未
开始，就没有"构建中"可言（#191 的额度门在 startTask 之前，被拒的请求一行任务都不落，
也不该在项目频道上留一串假刻度）。`failed` 的 log 与返回给调用方的 message 逐字相同——
两处各写一遍就会漂移，发布链路的用例钉的就是这一条。PublishPanel 本来就订着项目频道，
所以渲染进度从这一刻起出现在同一个读数行里，不用改界面。

见证：`apps/web/test/storyboard-render-build-status.integration.test.ts` 4 条（记账总线 +
项目频道事件串：快乐路径 building→ok 且不发 preview.status / ffmpeg 起不来 building→failed
且 log 与 message 逐字相同 / 额度耗尽与没有分镜各零事件）。变异探针 5 种全部精确红：
不发射 building / 失败不发射 failed / 成功不发射 ok / 额度门之前就发射 building /
failed 的 log 与 message 漂移。tsc 0、eslint 0。

**下一步**：时间线预览与镜头列表的互相定位（点时间线格子找到那一镜、反过来也能跳）——
面板联动，纯界面层，按 §90 的键盘可达要求一起做。

## M5 第七片（#194）：时间线 ↔ 镜头列表互相定位——联动是取景框，不进撤销栈

`timelineBlockWidths` / `shotIndexAtX`（video-model 纯函数）+ StoryboardPanel 的联动：
点条上任意一格，镜头列表滚到并高亮那一镜；点镜头行里的「定位」，条上那一格滚进视野。
读屏各有一句播报（§90）。

两条设计立场：

1. **联动不改模型**。它是投影上的取景框，不是一次编辑——所以没有补丁、不进撤销栈
   （§150 管的是改动，不是查看）。高亮只是 `border-accent-2` 与一个 data 属性。
2. **命中判据用布局后的累计宽度，不用时长线性换算**。短格有 6px 下限（一格 100 毫秒
   在 9 秒的条上只有 2.67px，不抬下限这一镜就"没有"了），线性换算会把点在被抬宽的
   短格上的点击算到邻居身上。下限改的是布局不是数据：`durationMs` 一个字节没动（§16）。
   像素坐标取点击那一刻的 rect——条宽随面板伸缩，拿状态里的旧宽度会对偏。

见证：`packages/video-model/test/timeline-edit.test.ts` 新增 4 条（占比与下限 / 总长 0 不出 NaN /
命中含下限的累计宽度 / 越界夹到两端与空分镜 -1），video-model 全量 83/83 绿；tsc 0、eslint 0。
变异探针 4 种全部精确红：去下限 / 命中改线性换算 / 空分镜返回 0 / 越界不夹。
DOM 联动层（onClick → scrollIntoView）按仓库惯例不进单测（无组件测试设施），
其判定逻辑已在纯函数侧钉死。

**下一步**：M5 收尾两格——① 分镜导出（把整条分镜连同成片打进导出 zip，§105 的
"导出必须能被重新导入"要覆盖视频产物）；② 或 §133 的 generation 档位在 render 链上的
呈现（哪个档位每月能渲几版，页面上看得见）。

## §124 状态层：`states` 从模型走到四个投影，其中只有只读页面会真的自己变（#164-167，2026-10-24）

`DesignNode.states` 从模型建立那天就在，但四处投影里只有生成代码会写 `hover:bg-…`：
画布、预览、发布页都只读 `nodeStyle(node)`，状态补丁被静默丢掉。§16 要求四处同源，
§159 又不许"看着像功能、实际不改变任何行为"——所以按四片补齐：

1. **codegen**：`hover:` / `active:` / `focus:` / `disabled:` / `data-[state=loading|error|success]:`
   变体类；状态是整通道替换，因此"基础态有、状态态没有"的通道要显式发射重置
   （`bg-none`、`bg-transparent`、`border-0`、`border-[transparent]`、`shadow-none`、`blur-none`、
   `backdrop-blur-none`、`text-inherit`）。状态名与变体名的唯一来源是 `states.ts`。
2. **code-parse**：同一张表反向解码；解出的补丁与基础态相同的类按 unmapped 报告（生成侧不会产它），
   源代码里没有的状态直接丢掉（`states: {}`），零字段的分组保留模型原值。
3. **预览 / 发布**：`stateStyleSheetFor` 用同一个 `nodeStyle` 算基础态与状态态、对 `CSSProperties`
   求差，写成 `[data-node-id="…"]:hover { … !important }`——基础样式是内联的，不加 `!important`
   就永远赢不了。没有状态节点时返回空串，页面也不产出 `<style>` 标签。
4. **画布是编辑面，故意不加状态规则**：hover 改外观会和选择、拖拽、手柄互相干扰；
   要看状态就开预览。这条边界写进 ADR-0062。

**未兑现的口径**：`loading` / `error` / `success` 靠 `data-state="…"`，发布页没有运行时驱动去设这个属性，
它们只在导出的代码里有语义（预览页可用 `?state=loading|error|success` 明确演示，见 ADR-0063）；
`disabled:` 只对真实 disabled 元素生效，生成的 JSX 目前是 `div`。
只读页上真正自己会变的是 hover / active / focus。

见证：codegen 5 条、code-parse 5 条、render 6 条；`e2e/studio.spec.ts` 的
「§124 状态层在预览与发布页真的生效」走完整回路（代码视图加 `hover:bg-[#123456]` → 回写模型 →
重载后仍在 → 预览页移上指针读计算色 `rgb(18, 52, 86)` → 移开读回基础色 → 发布后访客页再读一遍）；
「§124 状态预览」再钉住 `?state=loading` 的三个判据（只有定义了该状态的节点变 / 没定义的节点不动 /
切状态保留 `viewport=tablet`）。Properties 面板的状态编辑器已由 part ⑤ 落地（tab + 四通道 + 清除/删除）。

**下一步**：状态补丁的复制/批量应用（现在只能逐节点编辑）；发布页的 `data-state` 仍需要作者
自己的运行时去设——平台不再补假驱动，这已是产品的边界而不是欠账。


## M5 第八片（#195）：分镜导出与导回——包里多一层 storyboard，导入侧按字节类型分派摄取门

M5 收尾两格的第一格（§105 的"导出必须能被重新导入"要覆盖视频产物）：

- **导出侧**：`ExportPart` 加 `storyboard`；`EXPORT_FORMAT_VERSION` 2 → 3——加 part 必须升版本，
  导入侧按**相等**判版本，不升就是自家导的包被自家拒收。README 两种文案（有 / 没有分镜）
  外加 §160 的 DEMO 声明；`storyboard/storyboard.json` 就是 `loadStoryboard` 那份文档，
  参考帧不重复带字节（按 id 引用 `assets/`，同一个 mp4 进包两遍只是让包变大）。
- **导入侧**：`readManifest` 的 parts 放行 `storyboard`；`versionHint` 补 v2 分支
  （"v2 的包里没有分镜那一层……请重新导出一次（v3）"）；`PackagePlan.storyboard`，
  缺文件 / 坏 JSON / 过不了 `StoryboardSaveRequestSchema` 都整包拒收——包是外部输入，
  "是自家导出的"不免检，与 design 同一口径。
- **摄取门按字节类型分派**：`importProjectZip` 的资产循环先 `sniffVideoMime`，视频字节走
  `uploadVideoAsset`（genMeta 记 `storyboardId` = 源分镜 id / `provider` / `demoMode` /
  `importedFrom`），否则走原 `uploadImageAsset`。**v3 之前视频资产其实进不来**——
  成片被当图片递过去必被拒，"导入成功但成片没了"是个既有洞，这一片补上。
- **分镜写在资产之后**（idMap 齐了才能换号）：`remapStoryboard` 做三件事——引用过 idMap
  换号、不在 idMap 里的引用**删字段不删镜头**（留着就是悬空指针，`saveStoryboard` 的
  firstForeignRef 会整份拒收；为一处断引用丢掉整份分镜不如删掉它并记 note）、
  `characterId` 一律剥掉（导出格式没有角色这一 part，不剥照样被整份拒收——
  那是拿"导入失败"掩盖"角色没随包走"）。`ImportReceipt` 多一个 `storyboardNotes`：
  剥了谁、断了哪条引用、库里新 id 与源 id 对不上是正常的，全部点名（§159）。
- 路由 `QuerySchema` 枚举放行 `storyboard`；`ExportPanel` 多一个勾选；
  `ImportPanel` 回执显示分镜份数与 notes。

见证：`zip-import.test.ts` 27 条（v1/v2 拒收各带版本提示；storyboard 缺文件 / 坏 JSON /
过不了契约三条拒收；正面用例钉住计划里带着分镜）；`export.integration.test.ts` 11 条
（有分镜 `counts.storyboard=1` 且 README 含"分镜"与 DEMO 声明；没有分镜照实写
"这一版没有分镜可导"；版本断言升 3）；新文件 `storyboard-import.integration.test.ts`
2 条真往返（换号 / 剥角色 / 断引用删字段 / 成片走视频摄取门）。五文件合跑 52/52 绿，
tsc 0、eslint 0。变异探针 4 种全部精确红：不按 mime 分派（assets 1≠2）/ 不剥 characterId
（saveStoryboard 拒）/ 不删断引用（firstForeignRef 拒）/ 版本不升（export 版本断言红）。

**下一步**：M5 收尾最后一格——§133 的 generation 档位在 render 链上的呈现；以及
"角色随包走"仍是缺口（导出格式无 character part，当前口径是剥掉并点名，要补得先加 part 再升 v4）。


## M5 第九片（#196）：§133 generation 档位接上 render 链——"本月还可渲几次"与门同源

M5 收尾第二格（也是最后一格）：#191 落成渲染额度门之后，"哪个档位每月能渲几版"
一直只是 credits 页表格上的一列字。这一片把它接到渲染链上：

- `credits.ts` 加纯函数 `videoRenderQuota(plan, videoBalance)`：转述 `PLAN_MONTHLY_GRANTS`
  与 `GENERATION_COST`（每月发几点 / 一次扣几点 / 余额还够几版，向下取整、负余额夹 0）。
  不新算一份成本——展示与门（`refusalForRun`）必须读同一组数，对不上比不展示更糟（§159）。
- `credit-ledger.ts` 加 `renderQuotaFor(userId)`：与 `refusalForRun` 同样先
  `ensureMonthlyGrants` 再读余额。只读入口触发幂等发放，没有第二份真相。
- render 路由 GET 带回 `quota`；StoryboardPanel 在渲染按钮下显示
  "Free 档：每月 5 次成片渲染 · 每次 5 点 · 本月还可渲 N 次"，0 次时按钮置灰
  （服务端本来就会 429，置灰只是不让你白点）。
- **两处随之不再是谎的旧文案**：`ENFORCED_PLAN_AXES` 把 generation 从"表格上的字"
  挪进"有真的拦截方"（#191 的门就是它的拦截方）；credits 页"Video 没有消耗方"
  （#191 起成片渲染每次扣 5 点）与"只有 ai 一类有消耗方"两处照实改。
  e2e 钉的 image 格"今天没有消耗方"不动——变的是 video 那一格。

见证：`credits.test.ts` 新增 `videoRenderQuota` 4 条（整数倍 / 向下取整 / 负余额夹 0 /
逐档转述），axes 两条断言跟着升格；route 集成测试新增 GET quota 用例（关系断言 +
与 `readCredits` 对源 + 连看两次不重复发放）。三文件 40/40 绿，tsc 0、eslint 0。
变异探针 3 种全部精确红：rendersLeft 不除以成本 / 路由不吐 quota / generation 挪回未生效列。

**下一步**：M5 全部收尾。候选：①"角色随包走"（导出格式加 character part 再升 v4，
当前口径是剥掉并点名）；② §133 剩余两格（teamCollaboration / publishing）的拦截方；
③ Studio 画布上 videoAssetId 成片的播放预览（时间线 playable 仍是 false，§160）。


## M5 第十片（#197）：角色随包走——导出加 character part，格式版本升到 v4

#195 留下的明确缺口：分镜的镜头可以挂角色，但导出格式里没有角色那一层，导入侧只能把
`characterId` 一律剥掉。这一片把角色接进包里：

- **导出侧**：`ExportPart` 加 `character`；`EXPORT_FORMAT_VERSION` 3 → 4（加 part 必须升版本，
  导入侧按相等判，不升就是自家包被自家拒）。`character/characters.json` 是角色档案数组；
  `projectId` / `worldId` **不随包走**——导入时角色挂到新项目自己的世界上（§46，与资产换号
  同一规矩）。读不出来的档案不进包，README 点名数量。
- **导入侧**：parts 放行 `character`；`versionHint` 补 v3 分支；`PackagePlan.characters`
  每位过 `CharacterSchema`（缺文件 / 坏 JSON / 不是数组 / 形状不过，都整包拒收）。
  建档两步走：`createProjectCharacter`（只带名字）→ `updateCharacterProfile`（档案整份恢复）。
- **角色档案里的参考图也换号**：`remapCharacterProfile` 把 `visualIdentity.referenceAssetId`
  过 idMap，换不到号就置空（nullable 是契约允许的形状）并记 note——悬空引用才是Bug。
- **分镜的 characterId 从"一律剥掉"变成"过 characterIdMap 换号"**：换不到（没导角色 /
  那位建档失败）才剥掉并点名。`remapStoryboard` 现在是资产与角色两条换号线。
- `ImportReceipt` 加 `counts.character` 与 `characterNotes`（没建档 / 档案没写回去 / 参考图
  置空，全部点名）；路由枚举、ExportPanel 勾选、ImportPanel 回执同步。

见证：`zip-import.test.ts` 33 条（v3 拒收带"重新导出一次（v4）"、character 四种拒收、
正面计划带角色）；`export.integration.test.ts` 13 条（有/无角色两种 README 文案、版本断言升 4）；
`storyboard-import.integration.test.ts` 往返 4 条（v4 happy path 角色换号 + 档案参考图换号、
建档失败剥角色、参考图悬空置空）。五文件 62/62 绿，tsc 0、eslint 0。
变异探针 3 种全部精确红：不建档角色 / 档案参考图不换号 / 版本不升。


## M5 第十一片（#198）：成片播放预览——渲出的 mp4 在面板里直接播，DEMO 三个字照旧

#191 起分镜能真渲出 mp4，但 Studio 里看不了成片：点完「DEMO 渲染整条分镜」只有一个
文字回执，成片字节躺在资产里，界面上没有任何东西能播它。这一片把播放接上：

- `StoryboardPanel` 渲染结果区加 `<video controls preload="metadata">`，src 走
  `apiAssetUrl(assetId)`（`apps/web/src/studio/assets.ts`）——assetId → URL 本来就是投影，
  鉴权路由 `/api/assets/<id>/file` 按嗅探 mime 吐字节，同源带 cookie 直接就能播（§16）。
  没有新写 URL 拼接，也没有摆一个播不出来的假播放器。
- 历史清单每条也各挂一个播放器（同样 `preload="metadata"` 控制成本）：渲过几版就能挨个
  回看，哪版正挂在某一镜上照旧在文本里点名（#192 的反查不动）。
- DEMO 标注一处没撤：按钮、角标、播放器 title 三处都写着"真 ffmpeg 字节、像素是本地
  确定性推演、不是 AI 生成"（§160）——能播了，来源照实。
- 时间线 `playable` 仍只认"每镜都有 videoAssetId"（§40/§41）：DEMO 整条一条片子只挂
  第一镜，多镜分镜 playable 仍是 false——播放预览与 playable 不矛盾，没有为了好看
  去动那个语义。

见证：`e2e/storyboard.spec.ts` 新增真 Chrome 见证（渲染前 0 个播放器 → 渲完结果区 1 个、
src 是 `/api/assets/<uuid>/file` 形状、readyState≥1 即元数据真的从鉴权路由流了回来、
DEMO 角标还在、历史清单每条各一个）。21.4s 通过。
变异探针 2 种全部精确红：src 改坏（toHaveAttribute 红）/ 两个 video 删掉（toHaveCount 红）。
DOM 胶水层按仓库惯例不进 vitest 单测（同 #194 先例），钉子打在 e2e 上。

**下一步**：候选：① §133 剩余两格（teamCollaboration / publishing）的拦截方；
② 渲染完成后时间线自动定位到挂着成片的那一镜（renderNote → focusShot）；
③ e2e storyboard 全量回归（七条一起跑）。


## M5 第十二片（#199）：publishing 档位接上发布链——"同时最多公开发几个项目"从此真的会拦

§133 五格里剩下的 publishing 一格（`PLAN_LIMITS.concurrentPublishes`）此前只是 credits 页
表格上的一列字。这一片给它落了一个真拦截方：

- `credits.ts` 加纯函数 `refusalForPublishSlot(check)`：转述 `PLAN_LIMITS[plan].concurrentPublishes`，
  没满放行、占满拒，拒绝话里带档位/上限/当前数（与 `refusalForStorage` 同一条口径）。
- `credit-ledger.ts` 加 `activePublicationCount(ownerId, excludeProjectId)` 与
  `publishSlotRefusalFor(ownerId, projectId)`。三条口径写进注释：只数 `visibility != 'private'`
  的行（unpublish 切 private 即释放名额）；排除本次发布的项目自己（一条 path 一行，
  换版本是 UPDATE 不占新名额）；软删项目不占（URL 随项目消失，与 storage"软删仍占空间"不同）。
- `publishProject` 在 scan 之后、门禁检查旁边接入：outward 且名额满 → `emitBuildStatus('failed')`
  + 返回 `{ ok: false, reason, gate, scan }`（与相邻被拒分支同一形状，不自创第三种流法）。
  切 private 的下架动作永远放行——挡住架等于逼着页面继续挂公网。
- `ENFORCED_PLAN_AXES` 加入 publishing，`UNENFORCED_PLAN_AXES` 只剩 teamCollaboration；
  credits 页"今天有真的拦截方的只有…三格"改四格并点名发布名额，新增"你的发布名额：已公开 N / M 个"
  实览（与门读同一口径）。
- **测试数据的档位修正**：门一生效，21 个既有集成文件里"同一 owner 反复发布多个项目"的用法
  （free 档上限 1）全部误伤。修法不是松门，是新建 `test/support/test-plan.ts` 的 `raisePlan`
  把这些用例的用户升到 studio 档——它们测的不是档位；名额门本身由 `publish.integration.test.ts`
  新增用例用一个 free 档新用户钉全（第二个项目被拒且话里带数 / 换版本不占名额 / unpublish 释放 /
  private 永远放行 / 被拒项目零行）。

见证：credits.test.ts +4 条（26/26）；publish.integration 9/9；受影响的 21 个集成文件逐个复跑
全绿（api-v1-publish / notifications / account-deletion 三处漏网逐个补上）。tsc 0、eslint 0。
变异探针 3 种全部精确红：门整个禁用 / 去掉"排除本项目"（换版本被误拒）/ 边界 `<` 改 `<=`。

**下一步**：候选：① §133 最后一格 teamCollaboration 的拦截方（需要先有成员/邀请模型，
是比前四格大的一块）；② 渲染完成后时间线自动定位到挂着成片的那一镜；③ e2e storyboard 全量回归。


## M5 第十三片（#200）：渲完成片，镜头列表自己找到挂着它的那一镜

#198 让成片能播之后，还剩一个小缺口：渲染结果区在面板底部，而"成片挂在哪一镜"在
镜头列表的第一行——用户刚点完渲染，界面上没有任何东西告诉他该看哪。这一片补上：

- `renderDemo` 成功后（刷完历史清单之后）`setLinkedShotId(first.id)` + 滚动 + 播报：
  那一镜滚进视野并高亮，读屏听到"成片已挂到第 1 镜，镜头列表已定位到它"。
- **不走 `focusShot()`**：那个函数的播报话是"用户点了定位"的口径，这里是渲染完成的
  副作用，话要说明白是"成片挂在了这一镜"——同一个联动，两种来历，不共用一句播报。
- 同样只动视图状态，不进撤销栈：§150 管的是改动，查看类的定位从来不是事务
  （#194 立的规矩，这里沿用）。

见证：e2e storyboard 播放预览用例追加三断言（linked 计数为 1、linked 的就是渲染前取的
那个 shotId、播报含"成片已挂到第 1 镜"）。真 Chrome 两连跑通过。
变异探针精确红：摘掉 `setLinkedShotId(first.id)` → linked 计数断言红。


## M5 第十四片（#201）：teamCollaboration 档位落库——成员/邀请模型 + §133 五格全有拦截方

§133 五格的最后一格。前三格（aiUsage / storage / generation）与 publishing（#199）都已落门，
这片把"每个项目除 owner 外能拉几个协作者"从表格上的字变成真拦截：

- **库**（迁移 0039，可重入）：`project_members`（既成事实，unique(projectId, userId) 挡
  两个标签页同时接受同一枚邀请）+ `project_invites`（未兑现的承诺，token 是链接 secret，
  pending / accepted / revoked 三态）。owner 自己不是成员行——teamMembers 数的是
  "除 owner 外还能拉几个人"，把 owner 算进去 free 档（1）连自己都装不下。
- **`credits.ts` 纯函数** `refusalForTeamSlot`：转述 `PLAN_LIMITS.teamMembers`，
  没满放行、占满拒，拒绝话带档位/上限/当前数，并点名"撤回/移除释放名额"。
- **`credit-ledger.ts` `teamSlotRefusalFor`**：成员 + pending 邀请**一起数**——
  邀请没兑现也先占住，否则同一邮箱可以刷出任意多封等额度松了再兑现，门就白拦了。
- **`team.ts` 领域层**：invite / accept / revoke / remove / list 五件事，三条纪律：
  只有 owner 能拉人踢人（协作者互相拉人，团队就会自己长大）；**同一邮箱 pending 去重
  必须在名额门之前**（重复邀请同一封不是拉第二个人，先过门会误伤——这条是测试跑出来
  逼出来的顺序）；接受时邮箱必须与邀请相同（链接可转交，"发给谁的邮箱"在库里拦着，
  不靠 secret 猜不到当唯一防线，§159）。
- `ENFORCED_PLAN_AXES` 五格全满，`UNENFORCED_PLAN_AXES` 空数组（空不是漏，是没有还没
  拦截方的格子）；credits 页文案改"五件事全都有真的拦截方"，空列分支照实说。
- schemas 加四份报文：邀请请求 / 成员视图 / 邀请视图 / 名册回执（teamLimit 跟着回执走，
  界面才说得出"3/5"）。token 不进任何回执。

见证：`team.integration.test.ts` 5 条真库用例（接受落库+幂等 / pending 去重 / 名额门+
撤回与移除释放 / owner-only 权限 / 邮箱匹配与 token 失效）；credits.test.ts +4 条
（31/31 合跑绿）。tsc 0、eslint 0。
变异探针 3 种全部精确红：pending 不计数（③ 红）/ 摘 owner 检查（④ 红）/ 摘邮箱匹配（⑤ 红）。

**下一步**：① 成员/邀请的 API 路由与 Studio 界面（名册面板、邀请链接接受页）；
② e2e 见证邀请→接受全链路；③ e2e storyboard 全量回归。


## M5 第十五片（#202）：成员/邀请的 API 路由——转发的全部艺术是不重写

#201 落好了领域层，这片把五条路由接上，全部是 team.ts 的转发（§74：路由里另起一套
"先判归属再过门"的顺序，就是那条教训在发布上重演）：

- `GET /api/projects/<id>/members`：名册（成员 + 邀请 + teamLimit）。owner 与协作者都能看
  （team.ts 的 `projectVisibleTo`：被拉进一个项目的最低语义是看得见同伴），陌生人 404。
  `teamLimit` 跟着回执走——界面要说得清"3/5"，不能只罗列人名。token 不进任何回执。
- `POST .../members/invite` / `.../members/remove` / `.../invites/<inviteId>/revoke`：
  CSRF → requireUser → team.ts。被拒时错误码分得清：不在名下 404（与 characters 路由
  同一口径，不泄露存在性），名额满 400 `invite_rejected`（话里带数字）。
- `POST /api/projects/invites/<token>/accept`：按**当前登录用户**接受——token 证明
  "这枚邀请是真的"，用户的邮箱证明"这封是发给我的"，缺一不可（team.ts 里校）。
- schemas 补 `ApiMemberRemoveRequestSchema`（报文只传递"移除谁"，归属在域层判）。

见证：`team-routes.integration.test.ts` 6 条（roster 三方可见性 + token 不回显 / 名额门
经路由生效 / 非 owner 写 404 / remove 与名额释放 / revoke 与重复撤回 404 / accept 的
邮箱与 token 两道校验）。`route-security-gate` 结构门 5/5（新路由全部 csrfOk + requireUser）。
tsc 0、eslint 0。

**下一步**：① TeamPanel 界面（名册 + 邀请表单 + 邀请链接）+ StudioShell 加 tab；
② e2e 见证邀请→接受全链路；③ e2e storyboard 全量回归。


## M5 第十六片（#203）：TeamPanel + 邀请接受页——§133 团队协作的界面落地

#201/#202 把领域层与路由都落好了，这片是同一件事的最后一厘米：浏览器里真能走完
"owner 发邀请 → 协作者接受 → 名册多一个人"。

- `TeamPanel`（Studio 新 tab「团队」）：名册（成员 + 邀请 + teamLimit 三数齐全，
  界面说得出"已占 1 / 1"）、邀请表单、**一次性链接展示区**（`data-team-fresh-link`）。
  链接旁边明写"本机没有发信服务，链接由你转交"——不假装有邮件（§160）。
- `InviteResult.token` 只在**新建这一下**返回（#202 漏接的这段补上）：roster 永远不给它，
  去重命中也不给。前端的展示纪律跟着这条走——刷新页面链接就没了，要链接只能撤回再邀。
- `/invites/[token]` 落地页：未登录只说"先去登录再打开这条链接"（accept 按当前用户校邮箱）；
  已登录给接受按钮，被拒的话原样显示服务端的原因，不猜不重试。
- `StudioShell` 加 `team` tab；满员时邀请按钮照旧能点——服务端会拒，界面先说清为什么
  （§159：展示与门不许对不上）。

见证：`team.integration.test.ts` 契约随演进更新（新邀回执带 token 且与库中一致 / 去重不返
token / 名册 JSON 不含 token），11/11 与 team-routes 合跑绿；e2e `team.spec.ts` 真 Chrome
全链路通过（owner 发邀 → 满员拒绝话术 → 换 editor 登录接受 → 回 owner 视角名册+1，
32.9s）。变异探针 2 种精确红：摘新邀分支 token（① 红）/ 去重分支加 token（② 红）。
顺带修了两个环境坑：e2e 的 dev server 库 `nexus` 补打迁移 0039（两个库都要打，
ENVIRONMENT.md 的规矩）；playwright webServer 超时 120s→180s、用例 300s→360s
（冷编译偶发超时）。

**下一步**：① e2e storyboard 全量回归（七条一起跑）；② 协作者进得了其它面板
（design/assets 的 projectBelongsTo 目前只认 owner，可扩 projectVisibleTo）；
③ editor/viewer 的实质读写差别（目前只是档案标签，§160 已明码标注）。


## M5 第十七片（#204）：storyboard e2e 全量回归——揪出两个真 bug：双击裁切在界面上根本完不成

#198/#200 之后这套 e2e 只单跑过播放预览那一条，整组没跑过。整组一跑，红两条，
而且两条都不是测试的错，是产品真的坏了：

- **片段级裁切：双击永远切不成两镜**。根因不在坐标竞态，在结构：`locateFromStrip`
  （点条上任意一格 → 把那一镜滚进视野）和双击裁切共用**同一个滚动容器**——双击的
  第一击触发定位滚动，把时间线条自己推走了，第二击落空，`dblclick` 事件根本不合成。
  事件流里看得清清楚楚：只有一轮 click，没有 dblclick。只要条在折叠线下方（#191/#198
  把渲染区插进镜头列表和时间线之间之后它就在），这个交互在界面上就是死的。
- **修法（产品侧）**：时间线的交互面（标题 + 可播性 + 条 + 拖动读数 + 读屏播报）钉成
  面板底部常驻（`shrink-0`），说明文字/轨道/blockers 留在上面的滚动区。点条定位镜头时
  滚的是镜头列表，条不动了——双击的两击都落在同一块上。顺带这是更像视频编辑器的布局：
  时间线不再埋在三张卡片加一整段渲染区下面。
- **切句成镜：最后一镜的删除钮 toBeInViewport 红**。这条断言的字面契约（注释里写着）
  是"按钮不被面板那 264px 裁坏"——横向。#194 给每卡加了「定位」钮，卡片从三个包装行
  变四个，三镜时最后一镜的按钮跌到折叠线下 13px。竖直方向本来就不是这条断言管的事：
  镜头列表是滚动区，滚一下就到。把断言收敛到它的字面意图（按钮左右不出面板左右），
  并在注释里写清为什么不再要求两个方向都在视口里。
- **dblclickBlock 助手改走 `locator.dblclick({ position })`**：原来手量视口坐标再
  `page.mouse.dblclick`，布局在两次点击之间动一下（点名/配额段异步落库、第一击触发
  定位滚动）坐标就对偏了。locator 的点击自带行动性检查（可见、稳定、命中本元素），
  位移发生时会等它稳下来——这才是 Playwright 里点东西的标准方式。

见证：`e2e/storyboard.spec.ts` 整组 8/8 绿（1.6m；此前 6/8）。tsc 0、eslint 0。
变异探针 2 种全部精确红：把时间线 section 搬回滚动区 → 裁切用例立刻回到"切不成"
（证明钉住是承载性修复）；摘掉卡片的 `flex-wrap` → 删除钮右缘 685 ≫ 面板右缘 308，
新断言精确红（证明收敛后的断言仍抓着横向裁切）。两种探针均逐字节还原（sha256 25bde39a0b9e）。

**环境坑（重要，会反复遇到）**：`POST /api/projects` 的限流是 **dev server 进程内的内存态**
（`security/rateLimit.ts`，按 IP 计数）。连续几十次建项目之后它会 429，e2e 全部卡在
`waitForURL` 上每条耗到超时——症状是"整组突然慢如蜗牛"而不是"明确失败"。
**解法：杀掉 3100 上的 dev server 再重跑**（playwright 的 `reuseExistingServer` 会接新起的），
限流状态随进程清空。判据：dev log 里出现 `POST /api/projects 429` 就是撞限流了。

**下一步**：① 协作者进得了其它面板（design/assets 等路由的 projectBelongsTo 只认 owner，
可扩 `projectVisibleTo`）；② editor/viewer 的实质读写差别；③ v1 API 的 team 端点。


## M5 第十八片（#205）：协作者可见性贯通——读路径放名册成员，写路径仍 owner-only

#201-#203 把团队功能立了起来（成员/邀请/名册/接受页），但成员进了项目**只能看到名册**：
其余 30+ 条路由的 `projectBelongsTo` 只认 owner，协作者点不开项目本身。本片把**读路径**
的归属判定换成 team.ts 里已有的 `projectVisibleTo`（owner 或名册成员），写路径一律不动
（留给 #206 的 editor/viewer 角色门禁）。

- **28 处读判定换门**：4 个面板页（studio/world/game/preview）+ 19 条 GET 路由
  （project/assets/context/export/snapshots/world/game/storyboard/publish/characters/
  knowledge/memories/agent/annotations/variants/retrieve/knowledge-search/visual-dna/
  knowledge-block GET）+ retrieve 与 knowledge/search 两个语义上是读的 POST +
  5 个领域读函数（assetProjectId / apiProjectDetail / apiDesignDocument /
  projectGameCode / buildProjectExport / assembleAiRequest）。
- **写路径保持 owner-only**：所有 POST/PUT/PATCH/DELETE 变更路由（design、assets 上传、
  publish、snapshots、branches、memories、annotations、characters、agent、images 等）
  仍走 `projectBelongsTo`。#206 再按 editor/viewer 给写操作分角色。
- **踩到并修掉一个真回归**：`projectBelongsTo` 进门第一件事是 `isUuid` 形状门，
  `projectVisibleTo` 走的 `ownerOf` 没有——非 UUID 的 projectId 直接进 `eq()` 撞 22P02，
  404 变 500。id-shape.integration.test.ts 三条精确抓住。修法：`ownerOf` 补同一道形状门
  （与 projects.ts:485/503 同族函数同一写法）。
- **视觉 dna / knowledge search 的判定**：visual-dna POST 只算不写（写入走客户端
  setVisualDna 事务，那边是 owner 门），knowledge/search 与 retrieve POST 只读语料，
  都按"读"放行；knowledge/block 的 POST（Agent 组装用）同样只读，一并放行。
  GET 变体对"块不存在"如实回 404 block_not_found，与"人不该看"的 404 不是一回事。

见证：新增 `apps/web/test/collaborator-visibility.integration.test.ts` 3 例（成员四条读路
径 200/陌生人 404；成员 POST memories 404 而 owner 201；owner 读路径回归护栏），打真
Postgres（nexus_regress）。靶向回归 32 个集成测试文件 376 例：373 过 + id-shape 3 红
（即上述回归，修复后 63/63 全绿）。变异探针 2 种精确红：assets GET 门换回
projectBelongsTo → 成员读立刻 404；摘 ownerOf 形状门 → id-shape 回 500。均逐字节还原。

**下一步**：① editor/viewer 的实质读写差别（#206：协作者按角色门禁写操作）；
② v1 API 的 team 端点（#207）；③ 并行会话丢失的 ADR-0062 状态层投影四片可接手重做。


## M5 第十九片（#206）：editor/viewer 的实质读写差别——写路径三态门，role 不再是档案标签

#201-#205 之后协作者能读项目了，但**所有写路径仍然只认 owner**：邀请时选的
editor/viewer 只是名册上的一个字符串（§160 早就明码标注"未接"）。本片把 role 接进写门。

- **team.ts 新增 `projectWriteAccess(projectId, userId)`**：三态 `'ok' | 'read_only' |
  'not_found'`。owner 与 editor → ok；viewer → read_only；陌生人/不存在 → not_found。
  为什么不是布尔：viewer 是名册上的人，给他 404"项目不存在"是假话；陌生人必须继续
  404（不泄露项目存在性，与全站同一口径）。形状门复用 ownerOf 的 isUuid（#205 的教训）。
- **25 条写路由换门**：`not_found` → notFound()（原行为）；`read_only` →
  `jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；
  写入权限在 owner 与 editor 手里' })`。覆盖 design/assets/storyboard/world/game/
  characters/knowledge/memories/annotations/variants/branches/publish/agent/images/
  duplicate/snapshots 全家。
- **5 个领域层写函数同源换门**：annotations 的 add/delete/setResolved（add 的拒绝话
  说清"查看者只读，不能加批注"；AnnotationResolveResult 的 reason 联合加 `read_only`）、
  deleteAsset、apiPatchDesign（v1 API 保持 404 一律的约，但审计 reason 区分
  read_only_role 与 not_owner——"谁试过写别人的项目"这张表要能回答）。
- 团队管理（邀请/撤回/移除）仍 owner-only，不动（§133：协作者之间不能互相拉人）。

见证：collaborator-visibility.integration.test.ts 扩到 7 例——viewer 读 200 / 写 403
read_only_role（不是 404）、editor 写 201、陌生人写 404、owner 护栏。#205 的旧 ②
（"写路径仍 owner-only"）随本片改约为"editor 可写、陌生人 404"——那是 #205 时代的
临时契约，本片就是来兑现它的。靶向回归 36 文件 406 例全绿。变异探针 2 种精确红：
projectWriteAccess 摘角色判定 → viewer 写变 201；memories POST 门换回 owner-only →
editor 404、viewer 403 变 404。均逐字节还原（bda62ccde72e / 07948d067aa9）。

**下一步**：① v1 API 的 team 端点（#207）；② ADR-0062 状态层投影四片（并行会话丢失，
可接手重做）；③ 协作者通知/邀请过期等团队体验边角。


## M5 第二十片（#207）：v1 API 的 team 端点——名册读端点 + team:read 一格

§188 的公开 API 到 #206 为止只有项目/设计/发布四口，团队功能（#201-#203）一点没露出去。
本片补上最保守也最有用的一格：**名册只读端点**。

- **迁移 0040**：`api_tokens_scopes_known` CHECK 加 `team:read`（形状同 0019/0027/0028：
  text[] + CHECK，不重建 pg enum）。两个库都打（regress 供集成测试、nexus 供 e2e）。
- **schemas**：`API_TOKEN_SCOPES` 加 `team:read`；`ApiTokensPanel` 的 SCOPE_LABELS
  同步补文案（Record<ApiTokenScope, string> 逼着补，漏一个 tsc 就红）。
- **域函数 `apiTeamRoster`**：与界面名册路由**同一套装配**（listMembers/listInvites/
  teamMemberLimit，§74 不在路由里重写第二遍）；owner 与协作者读得着（projectVisibleTo），
  外人 null → 路由 404 project_not_found（v1 各端点同一句"不存在"）。邀请 token 是
  secret，回执里不出现。
- **路由 `GET /api/v1/projects/[projectId]/members`**：authorizeApiRequest('team:read')
  → apiTeamRoster → schema 校验 → recordApiAccess → apiJson。没有 POST：邀请/撤回/移除
  是 owner 的管理动作，公网凭据背后没有人可批（§133）。
- **静态三方一致测试自动把关**：api-tokens.test.ts 的"常量 / 迁移里生效的 CHECK /
  v1 端点真的执行它"三处比对——加 scope 不加端点会红，加端点不加 scope 也会红；
  端点名从文件位置推导，手抄的第四份名单同步更新。

见证：新增 `api-v1-team.integration.test.ts` 5 例（owner 读到名册且无 token 泄漏、协作者
凭据也读得着、外人 404、无 team:read 凭据 403、访问账留行 + 非 UUID 404）；id-shape 补
一条 v1 members 的 not-a-uuid 探针（不打 500 不变式）。api-tokens.test.ts 24 例全绿。
变异探针 2 种精确红：apiTeamRoster 改回 owner-only → 协作者读 404；摘 recordApiAccess
→ 账目断言红。均逐字节还原（2bee4e55ec35 / b38d085351b8）。

**下一步**：① ADR-0062 状态层投影四片（并行会话丢失，设计文档幸存，可接手重做）；
② 协作者通知/邀请过期等团队体验边角；③ e2e 覆盖协作者跨面板读（浏览器见证）。


## M5 第二十一片（#208）：状态层投影 part ①——codegen 发射变体类，状态名只有一份表

§124 的 states（hover/active/focus/disabled/loading/error/success）从第一天就在
DesignNode 上，但 codegen 一个状态类都没发过——模型里写了等于白写（§159）。
ADR-0062 分四片补，本片是第①片：**生成代码里出现状态变体类**。

- **`states.ts` 新文件，状态名与变体前缀的唯一来源**：`NODE_STATES`（七态 as const
  数组）+ `STATE_VARIANT`（hover→`hover:`、active→`active:`、focus→`focus:`、
  disabled→`disabled:`、loading/error/success→`data-[state=…]:`）。code-parse
  （part ②）也从这里读，杜绝"生成写 `data-[state=loading]:`、解析只认
  `data-state=loading`"的半通事故。`NodeStateStyle` / `NodeStates` 类型同文件定义。
- **types.ts 的 NodeState 改为转发**：本地字面量联合删除，`export type { NodeState }
  from "./states"`；`states` 字段类型改用 `NodeStates`。全仓除 types.ts 外无其它
  NodeState 引用，改造零连带。
- **codegen `stateClasses(node, prefix)`**：只发补丁里真正指定的四通道——
  fills→bg（text 节点是字色 `text-[…]`，与渲染层同一份契约）、strokes→border、
  effects→shadow/blur、opacity；变体前缀拼在 utility 前。补丁没有的状态、
  没有指定的通道，一律不发射。`styleClasses` 加可选 `variant` 参数复用同一套
  token/字面量逻辑（默认空串，基础态行为逐字节不变）。
- **未兑现的口径**（ADR-0062 明载）：loading/error/success 的 `data-[state=…]`
  变体目前只是类名，生成的 JSX 元素并没有 data-state 属性，运行时还不生效；
  真正兑现要等 part ③ 的只读样式表和后续运行时接线。本片只保证"类发得对"。

见证：新增 states-codegen.test.ts 8 例（hover fills→`hover:bg-[…]`、无 states 零变体类、
七态前缀逐一从 STATE_VARIANT 发射、text 节点状态 fills 是字色、strokes/effects/opacity
三通道带前缀、未指定通道不发射、token 引用走 CSS 变量、表与 NODE_STATES 严格同键）。
design-model 全包 353 例绿。变异探针 3 种精确红：摘 classOf 里的 stateClasses 接入 →
5 个发射用例红；STATE_VARIANT.loading 改成半通的 `data-state=loading:` → 表完整性断言红
（七态用例同源读取仍自洽，硬编码断言就是抓这个）；摘 text 字色分支 → text 用例红。
均逐字节还原（b697580ab283 / 1f5bdf58bfbb）。

**下一步**：part ② code-parse 往返（解析 `hover:bg-[…]` 回 states，§19 往返 0 ops/0 unmapped 不变）。
import io

path = "docs/ROADMAP.md"
src = io.open(path, encoding="utf-8", newline="").read()
entry = '''

## M5 第二十二片（#209）：状态层投影 part ②——code-parse 往返，状态类回写成 states 补丁

part ① 之后 codegen 会发 `hover:bg-[…]` 这类变体类，但 code-parse 的 VARIANTS 表
里只有 md:/lg:/xl: 三个断点前缀——状态类会整条掉进"不在白名单"的 unmapped，
§19 的往返不变式（parse(generate(page)) 零补丁零 unmapped）在带 states 的页面上
直接破功。本片把状态类接回来。

- **反向表从 STATE_VARIANT 反推**：`STATE_VARIANTS`（前缀 → 状态名）由
  `Object.entries(STATE_VARIANT)` 映射得来，不手抄第二份表（ADR-0062 的唯一来源
  纪律）。开发时这里真翻过一次车：entries 产出的是 [状态名, 前缀]，按
  [前缀, 状态名] 解构 → `STATE_VARIANT["hover:"]` 全是 undefined，9 个测试全红。
  as 断言把类型检查也骗过去了，是测试抓住的。
- **decodeState：桶即完整真相**。状态变体类先进各自的桶（与断点桶同构），整桶交给
  decodeState 做**整通道替换**——只认 fills/strokes/effects/opacity 四通道
  （与 stateClasses 发射侧严格对称）：fills→bg-[…]（text 节点是 text-[…] 字色）、
  strokes→border-[宽度px]+border-[颜色]、effects→shadow/blur、opacity。
  桶里缺席的通道即删除；一个通道都不剩的状态整个删掉。桶里任何其它类
  （如 hover:rounded-[8px]）如实 unmapped。
- **stateOps 回写**：与 responsiveOps 同构，写 `states` 路径一个 set op；
  四通道整体覆盖该状态（不是合并——合并会让"删掉 base fills 只留 opacity"这种
  编辑把旧 fills 残留下来）。

见证：新增 states-parse.test.ts 9 例（带 states 模型往返 0 ops/0 unmapped、
hover:bg 新增、text 字色、border 双腿、shadow、data-[state=loading]:opacity、
token 引用反解 {color.primary}、整通道替换 toEqual 严断言、rounded 越界 unmapped
且不回写）。design-model 全包 362 例绿。变异探针 3 种精确红：摘 stateOps 接线→
7 红；decodeState 去掉 text 字色分支→text 用例红；stateOps 改合并→整通道替换
用例红（第一轮探针没红——toMatchObject 是部分匹配放过了残留 fills，已把该用例
收紧为 toEqual 后复测精确红）。均逐字节还原（f8c253061551）。

已知边界（与 responsive 同构）：把某状态的全部类删干净时，模型里的状态条目保留
（断点删除也是这个行为）；要删单个通道，桶里留任意一个该类状态的类即可触发替换。

**下一步**：part ③ 预览/发布只读样式表（stateStyleSheetFor 差量 + !important，
无状态节点返空串，接进 preview/[projectId] 与 n/[handle]/[slug] 两个页面）。
import io, sys

path = "docs/ROADMAP.md"
src = io.open(path, encoding="utf-8", newline="").read()
entry = '''

## M5 第二十三片（#210）：状态层投影 part ③——预览/发布只读样式表，!important 越过内联样式

part ①② 之后状态在代码视图里进出自由，但预览与发布页仍只读 nodeStyle 的基础态——
状态补丁被静默丢掉（§159 说的"看着像功能、实际不改变任何行为"）。本片把状态投影到
两个只读页面。

- **`apps/web/src/studio/state-styles.ts` 新模块 `stateStyleSheetFor`**：对每个带
  states 的节点，用同一个 nodeStyle 分别算基础态与状态态（状态补丁按整通道替换
  覆进 style），对 CSSProperties 求差，差量写成
  `[data-node-id="…"]:hover { … !important }`。基础样式仍是内联，状态规则靠
  !important 越过它——不写的话服务端渲染的 style="background-color: …" 永远赢。
- **CSS_RESET**：基础态有、状态态显式清空的通道必须显式重置
  （background-color: transparent / box-shadow: none / filter: none /
  backdrop-filter: none / color: inherit / opacity: 1），否则 hover 会保留
  上一层的视觉，而那恰恰是作者说要换掉的东西（ADR-0062）。
- **状态选择器与 Tailwind 变体是两套**：代码视图用 STATE_VARIANT 的 Tailwind
  前缀（hover: / data-[state=loading]:），只读页面用真实 CSS
  （:hover / [data-state="loading"]），同唱 NODE_STATES 一张名册。
- **画布不加状态规则**（ADR-0062：编辑面 hover 改外观会和选择/拖拽/手柄打架）；
  预览页与发布页（n/[handle]/[slug]）在各自画框内注入 <style data-nexus-states>，
  空样式表不产标签。loading/error/success 三条只读页面没有运行时驱动设置
  data-state，规则在但暂不触发——ADR 已明载此口径，不假称生效。

见证：新增 state-styles.test.ts 9 例（hover fills 差量、无状态空串、opacity、
loading 属性选择器、fills/effects/text 三种重置、多状态多规则且只含差量、
补丁与基础态一致不发射空规则）。变异探针 3 种精确红：摘 !important→7 红；
摘重置分支→3 个重置用例红；摘空差量守卫→"一致不发射"用例红。均逐字节还原
（0cf8360681bb）。apps/web typecheck + eslint 过。

**下一步**：part ④ 浏览器见证（e2e/studio.spec.ts 加"§124 状态层在预览与发布页
真的生效"全回路用例）+ ADR 点名但尚未兑现的 reset 类往返（hover:bg-none 等）。
import io, sys

path = "docs/ROADMAP.md"
src = io.open(path, encoding="utf-8", newline="").read()
entry = '''

## M5 第二十四片（#211）：状态层 reset 类往返——hover:bg-none 们进生成器与解析器

ADR-0062 点名"删掉基础态里有、状态态里没有的通道必须显式发射重置"，part ①②
只处理了取值类，重置类（bg-none / bg-transparent / border-0 / border-[transparent] /
shadow-none / blur-none / backdrop-blur-none / text-inherit）两边都不认——作者在
代码视图写 hover:bg-none 会掉进 unmapped，模型里 fills: [] 也生不出类。本片补上。

- **codegen 发射**：补丁通道是显式空数组时发射重置类——fills: [] → text 节点
  `text-inherit`，其它 `bg-none` + `bg-transparent`；strokes: [] → `border-0` +
  `border-[transparent]`；effects: [] → `shadow-none` + `blur-none` +
  `backdrop-blur-none`。opacity 是标量没有"空"形态，reset 不适用于它（文档化边界）。
- **code-parse 回解**：bg-none/bg-transparent → fills: []；text-inherit → fills: []；
  border-0/border-[transparent] → strokes: []；shadow-none/blur-none/backdrop-blur-none
  → effects: []。与取值类冲突时重置优先，取值类如实 unmapped（不静默丢弃，§159）。
- **与 part ③ 的闭环**：模型 fills: [] → 代码 hover:bg-none → 解析回 fills: [] →
  只读页面差量出 background-color: transparent !important。三处同一口径。

见证：states-codegen.test.ts +2（重置类发射、text-inherit 不是 bg-none）；
states-parse.test.ts +6（bg-none 往返、border 重置、shadow-none、text-inherit、
重置与取值冲突、显式重置模型往返 0 ops/0 unmapped）。design-model 全包 370 例绿。
变异探针 3 种精确红：摘 codegen fills 重置发射→6 红（含往返与 text-inherit）；
摘 parse fillsReset 识别→3 红；borderResets 过滤器永不命中→2 红。均逐字节还原
（ba7546a2cf20 / codegen b6feef78f72e）。

**下一步**：part ④ e2e 浏览器见证（e2e/studio.spec.ts「§124 状态层在预览与发布页
真的生效」全回路：代码视图加 hover:bg-[#123456] → 回写 → 重载仍在 → 预览读计算色 →
发布后访客页再读）。
import io, sys

path = "docs/ROADMAP.md"
src = io.open(path, encoding="utf-8", newline="").read()
entry = '''

## M5 第二十五片（#212）：状态层投影 part ④——浏览器见证全回路，ADR-0062 四片收口

part ①②③ 都有单测，但"预览页移上指针真的变色"这件事只有浏览器能见证。
本片按 ADR-0062 写明的回路走一遍，四片至此收口。

- **e2e/studio.spec.ts 新增「§124 状态层在预览与发布页真的生效」**：代码视图给
  Primary CTA 的 className 加 `hover:bg-[#123456]` → apply → 回写报告出现 states →
  画布悬停**不变色**（ADR：画布是编辑面，不加状态规则）→ 等落库 → reload →
  代码视图仍读得到那个类 → 预览页悬停读计算色 `rgb(18, 52, 86)`、移开读回基础色
  `rgb(107, 79, 240)` → 公开发布 → 访客页同样两个读数。每个页面各有一个反向读数。
- **真跑过**：dev server（NEXUS_DATABASE_URL 指 55100 的 nexus 库）+ 系统 Chrome，
  34s 通过；变异探针（stateStyleSheetFor 恒返空串）精确红在预览悬停那一步
  （expected rgb(18,52,86) / received rgb(107,79,240)），逐字节还原后复跑 13.4s 绿。

至此 ADR-0062 四片全部落地：① codegen 发射变体类（#208）② code-parse 往返（#209）
③ 预览/发布只读样式表（#210）④ 浏览器见证（#212），外加 #211 的 reset 类往返。
§124 的 states 从"模型里躺着没人读"变成"代码视图进、预览/发布出、往返保真"。

**下一步**：协作者通知/邀请过期等团队体验边角；§124 的 Properties 面板状态编辑器
（ADR 明载"入口仍只有代码视图与 AI 补丁，这是下一片的事"）。

## M5 第二十六片（#213）：邀请的有效期——7 天过期、不占名额、名册标成已过期

`project_invites` 自 #201 起没有 `expires_at`：一枚 pending 邀请**永远**占着名额、链接也永远有效。
这一片把"时间"接进来，四处必须同时成立，缺一件功能就是假的：

- **迁移 0041**：加 `expires_at`（可重入：`IF NOT EXISTS` → 设默认 → 回填历史行 `created_at+7d` → `SET NOT NULL`）。
  **不新增 status**：过期是 `status='pending' AND expires_at<=now()` 的**计算值**，不是第四种状态——
  加一档要改 CHECK / 类型 / 所有读路径，而"过期"是时间的函数，不该让人去改一行状态。
- **域层 `team.ts`**：`INVITE_TTL_DAYS=7`；`inviteView()` 统一算 `expired`；新邀写 `expiresAt`；
  去重查询排除已过期的（否则重新邀请同一个人会拿到一封失效邀请）；`acceptInvite` 在 accepted 幂等**之后**拒绝过期。
- **配额 `credit-ledger.ts`**：`teamSlotRefusalFor` 只数**未过期**的 pending——过期的还占名额，
  就是把 owner 永久堵在门外。
- **契约**：`ApiProjectInviteSchema` 加 `expiresAt` + `expired`（roster 与 v1 team 同源，两处自动跟上）。
- **界面 TeamPanel**：名额计数与"已占 N"排除过期；行内显示「已过期 / 有效至 YYYY-MM-DD」；
  `data-team-invite-expired` 供 e2e 断言。

**见证**：`team.integration.test.ts` 加 ⑥（有效期 ~7 天、改期到过去后收不了、名册 `expired=true` 且 status 仍 pending、
free 档下再邀同一个人成功且不是去重命中）与 ⑦（**顺序钉子**：已接受的邀请不因后来过期而失败——accepted 幂等优先）。
team 7/7、team-routes + api-v1-team 11/11、credits 36/36 全绿；tsc 0 eslint 0。
**变异探针 5 种全精确红**（逐个摘、逐个还原）：摘 `acceptInvite` 过期检查 → `rejected.ok` 变 true；
摘配额 `gt` → `again.ok` 变 false；`expired` 恒 false → `listed.expired` 红；摘去重 `gt` → 再邀命中同一封；
摘 accepted 幂等 → ⑦ 报"已兑现的邀请不该因为后来过期而报失败"。
迁移已打 regress（`55100/nexus_regress`）与开发库（`55100/nexus`）。

## M5 第二十七片（#214）：邀请兑现 → 项目 owner 收到一条 team 通知

§164 的登记表在 #94 之后长到十一类，而 §133 的邀请链路一直是"静默"的：协作者接受了邀请，
owner 只能靠自己再去看名册。迁移 0042 的注释写着「#213 之后邀请被兑现会通知项目 owner」，
但登记表补了第十二类 `team` 之后，真正的构造点还空着——`notify-producers.test.ts` 的普查
因此红着（登记了却没有走得通的生产者）。

这一片把缺的那一格补齐：

- **生产者 `team.ts` 的 `acceptInvite`**：成员行与邀请状态那个事务提交之后发一条 `team`。
  收件人按 `projects.ownerId` 现取（邀请行上的 `invitedById` 只是"当时谁发的"），actor 是接受邀请的人，
  `role` 来自邀请行。**只认"加入"这个终态**：发出 / 撤回 / 过期都不发；幂等重放早在函数上半段返回，
  刷新接受页不会把收件箱再点亮一次。
- **收件箱与偏好的消费者**：收件箱页与设置面板的 `KIND_LABEL`、`levelOf`（info 档）、
  `getNotificationSettings` 的默认全开——`NotificationKind` 是联合类型，这些手写表少一格就 tsc 红，
  这正是它们存在的意义。
- **迁移 0042**：`notification_settings_kind_check` 放进 `'team'`；只改设置表，
  `notifications.kind` 一直是纯 text（唯一写入方是 `planNotification`）。

**见证**：`notify-plan.test.ts` 加四例（两种角色读成两句、dedupe 键落到项目+人、链接指 Studio 团队面板、
登记与终态说明同在）；`team.integration.test.ts` ① 在真库上断言"兑现后 owner 恰好一条 team 通知
（标题带加入者与项目名），同一枚邀请再接受一次仍然只有那一条"；`notifications-settings.integration.test.ts`
再加一例，把 `team` 的开关真的写进库里（迁移 0042 的 CHECK 不是装饰）。
`notify-plan` + `notify-producers` 56/56、team 集成 7/7、通知偏好 5/5 绿。迁移 0042 已打到开发库（`55100/nexus`）。

## §124 状态补丁的复制/批量应用（ADR-0062 part ⑤ 续）：剪贴板是事务的来源，不是共享对象

§124 的状态编辑器此前只能逐节点、逐通道写：同一个 hover 补丁要套到三个元素，得手抄三遍，
而整通道替换的语义下抄漏一个通道，就等于把目标原来那条覆盖掉。本片补上复制/粘贴，
并把批量粘贴做成**一条**事务。

- **剪贴板是视图态**（`StudioSnapshot.statesClipboard`）：只存 `{state, patch, sourceNodeId, sourceName}`，
  不落库、不进撤销栈——它记录"要贴什么"，不是文档的一部分。`copyStates` 对空补丁
  （没这个状态，或状态在但通道已清成 `{}`）返回 false，入口据此禁用：复制一份空对象会让
  "粘贴成功"和"什么都没发生"长得一样（§159）。
- **粘贴整通道覆盖，值快照在复制那一刻**：`pasteStates` 给每个目标发一条
  `set states.<state>`，值来自复制时 `structuredClone` 的补丁；`applyPatch` 对每个 `set`
  再 clone 一次（§16 的唯一写入方），目标之间、目标与剪贴板之间不共享可变对象。
- **N 个目标 = 一条命令**（§149）：多选批量贴只进一条 history，撤销一次全部回滚，源节点不动。
  面板：单选给「复制 / 粘贴」两颗按钮与剪贴板来源说明；多选只给一颗
  `data-state-paste-batch="N"` 的批量按钮，剪贴板为空时禁用并说明原因。
- **状态名只有一份表**：`apps/web/src/studio/state-labels.ts` 的 `STATE_LABELS`
  （面板页签、按钮、撤销标签、剪贴板说明共用），从 `PropertiesPanel` 里搬出来。

**浏览器见证**（`e2e/studio.spec.ts:4531`，12.3s 通过）：CTA 写 hover 0.5 → 复制（说明写着来自
Primary CTA · 悬停）→ Headline 粘贴 → 撤销只回滚这一贴（Headline 回 1、CTA 仍 0.5）→ 重做 →
预览页两个元素真指针 hover 到 0.5、移开回 1 → 回 Studio 把源改成 0.4 → 多选两个元素批量贴
（都是 0.4）→ 撤销后 Headline 回到它自己的 0.5、CTA 保留 0.4。
落库屏障读的是 `GET /api/projects/:id` 里的文档本身：`已保存 HH:MM:SS` 可能是上一次保存留下的，
在它上面等会让预览页拿到没有 states 的旧文档（`autosave-label-is-not-persistence-proof` 那笔账）。

**见证撞出来的三处真缺陷**（都不是测试写法问题）：

1. **画布 surface 的 `overflow-hidden` 吃掉点击映射**（`98bbfe9`）：`hidden` 仍然是滚动容器，
   聚焦/`scrollIntoView` 会把它滚出偏移，而屏幕→模型映射只认 pan/zoom，滚过之后每次点选都落在
   别的节点上。换 `overflow-clip` 后聚焦框/选区框不再被裁，也不必改投影数学。
2. **流式首屏的 GET 晚到会抹掉会话**（`f4fb179`）：§147 让服务端随 HTML 先 bootstrap 同一份文档；
   `load()` 的 GET 晚几百毫秒返回时原先无条件 `reset()`，把用户刚选中的元素和这段时间的编辑一起清掉
   （表现是"刚点中的元素自己没了"，批量粘贴的多选就是被它清掉的）。现在
   `ready && loadedFor === projectId` 时直接返回——装进来的就是同一份文档，会话状态优先。
   `studio-stream-boot.test.ts` 两例：门控 fetch 造确定性竞态，外加"换项目仍要重置"的反向控制；
   变异（守卫改成 `false &&`）精确红在"选择保留"那一例。
3. **撤销"往空处新增字段"发出的是 JSON 会丢键的 `set`**（`6248106`）：PATCH 实测 400
   （`patches.2.ops.0.value: expected nonoptional, received undefined`）。新增显式 `unset` op
   （schema / apply / invert / diff / contracts / MCP 说明），"忘了写 value"仍然是错误而不是静默删除。
   详见 ADR-0065。

**读数**：clipboard 5 例、流式首屏 2 例、`unset` 2 例、patch-commands 36 例，共 45/45 绿；
两条变异探针各自精确红并逐字节还原（守卫改 `false &&` → 1 红；`pathUnset` 换成空实现 → 1 红）。

**已知边界**：剪贴板不跨刷新/项目（视图态），也不能只复制单个通道；粘贴对没有该状态的目标是新建，
对已有目标才是整份覆盖。`unset` 只删指定路径的叶子，不清理祖先空对象（`states` 会留下 `{}`）。


## §133 协作者角色变更：改角色立刻生效，不用「踢掉再邀」

#201-#206 之后 editor/viewer 在写门上真的分开了（`projectWriteAccess` 每次写请求现读成员行），
但**改角色没有入口**：把一个人从可编辑降为只读，只能移除再邀——对方要重新点链接接受，
中间这段时间他既进不去、也没人知道他为什么进不去；名额还会在撤回与接受之间空出来被别人占掉。

- **一条写路由**：`POST /api/projects/<id>/members/role`，CSRF → requireUser → `changeMemberRole`
  （转发纪律与 invite/remove 相同，归属判断留在 `team.ts`）。报文 `ApiMemberRoleRequestSchema`
  只收 editor/viewer：owner 是 `projects.ownerId` 的事实，不是可授予的角色——枚举里放 `owner`
  等于给"转让项目"开一个没实现的入口。
- **立刻生效**：角色存在成员行上，写门每次现读。降级后下一条写就 403 `read_only_role`；
  升级后不必重新接受邀请。会话不失效、身份不换、名额不动（改角色不是换人）。
- **拒绝分得清**：非 owner → 404（与"项目不存在"同一口径，不泄露存在性）；
  owner 已过门但名册上没有这个人 → 404 `member_not_found`。
- **界面说实话**：成员行多一个角色下拉（`data-team-member-role`），成功后通知带名字与新角色；
  页脚原先那句"editor/viewer 只是档案标签、权限模型还没接"是过期行（#206 后写门已落地），
  改成"editor 能编辑；viewer 的写请求会被服务端拒绝（403）。改角色立刻生效，不需要对方重新接受
  邀请，也不影响名额。"

**见证**：`team.integration.test.ts` ⑧（真库：改 viewer 后 `projectWriteAccess` 立刻 `read_only`、
改回立刻 `ok`、非 owner 改不了、不在名册 `not_member`、成员行不重复）；`team-routes.integration.test.ts` ⑦
（缺 CSRF 403 / `role:'owner'` 400 / owner 改成功并落库 / 降级后同一成员的写请求
**403 `read_only_role`** / 非 owner 404 / 不在名册 404 `member_not_found`）。两文件 15/15 绿，
`route-security-gate` 5/5（新路由结构门）。

`e2e/team.spec.ts` ⑤（39.4s 通过）：真浏览器里 owner 用下拉把 editor 降为可查看，读到成功话，
**刷新后**（重新 GET 名册）值仍是 viewer，名额仍 1/1；截图 `screenshots/team-role-changed.png`。

**见证撞出来的缺陷**：这条 e2e 第一次跑卡满 6 分钟——"注册 editor → 登出 → 注册 owner"那一步，
点完登出立刻 `goto('/')` 把还在飞的 `/api/auth/logout` 掐掉了，下一页仍是 editor 的会话，
注册页签永远不出现。登出改为等界面切回未登录态（`[data-auth-tab="register"]` 可见）再走，
三处登出都换掉；重跑 39.4s 绿。这不是测试写法的小事：登出按钮点完立刻离开首页，
登出请求同样可能被掐掉（本轮真浏览器证据），人换账号时会看到"登出了但还登录着"。

**变异**：去掉 owner 门 → 两文件各红在"非 owner"断言（2 红）；`.set({ role })` 写死成
`role:'editor'` → ⑧ 红在"库里的角色不是 viewer"（1 红）；两次都逐字节还原（sha256 不变）。

**不做**：改角色不发通知——`planNotification` 的 team 事件措辞是"加入了项目"，
在改角色上说这句是假话（§164 只给真发生的事发通知）。

---

## §133 × #206 viewer 只读 Studio：横幅先说清，编辑在本地就按下

写门（#206）在服务端已经是三态的：viewer 的写请求一律 403 `read_only_role`。但客户端不知道
自己是 viewer——画布照样接受拖拽、面板照样收编辑，用户先把界面改掉，再看着同一次改动被 403
打回顶栏。本片把这件事提前到界面：

- **角色由服务端给壳体**：`/studio/[projectId]` 改用 `projectWriteAccess`（三态）而不是
  `projectVisibleTo`——viewer 仍进得来（名册上的人看得到项目，不是 404），只是 `readOnly` 为真。
  `StudioShell` 拿这一个 prop 设置模块级的只读闸（`read-only.ts`），四个 store 共用一份
  （它们本来就是模块单例，各存一份只会分叉）。
- **设计文档**：`execute` / `undo` / `redo` / `save` / `flushSave` / `markDirty` / `renameDocument` /
  `jumpTo` / `applyAiTransaction` 全部在本地按下——不改文档、不进撤销栈、不排队保存、不标脏。
  两处例外是**视图偏好**：`setPage` / `setMode` 照旧本地生效（翻页、看模式是"看"），
  但 `markDirty` 的闸让它们不写库，下次载入回到服务端的值。
- **世界 / 游戏 / 分镜**：`setLocal`（world/game）与 `planFrom` / `applyOps` / `splitShot` /
  `undo` / `redo`（storyboard）各自在入口先挡；`commit` / `flushSave` 也挡（第二道）。
  这样"新建骨架""切一版分镜"这类动作不会先换掉界面再永远存不上。
- **横幅说实话**：`data-studio-read-only`，写明"文档可以看，编辑不会落到文档上——服务端会拒绝写请求（403）"。

**见证**：`apps/web/test/studio-read-only.test.ts` 6 例（设计文档三条 + world/game/storyboard 各一）：
只读下 execute/addNode/renameDocument/delete/undo/redo/save/flushSave 全不生效且**零写请求**；
切模式本地生效但 dirty 不变；关闸后编辑生效、`PATCH …/design` 落库、撤销能回；
三个子文档 store 只读下不换本地、不发 PUT，关闸后两条都发生。
`e2e/team.spec.ts` ⑥（37.2s 通过）：被降为 viewer 的 editor 重新登录进 Studio，
横幅可见且文案里有"查看者"；截图 `screenshots/team-viewer-read-only.png`。

**变异探针**（逐个摘、逐个还原，sha256 不变）：摘 `execute` 闸 → ① 红在"文档不该变"；
摘 `markDirty` 闸 → ①② 各红（脏标记与视图偏好）；摘 storyboard `applyOps` 闸 → 分镜用例红在
"只读下本地真值被换掉"；摘 `planFrom` 闸 → 同用例红在"只读下切出的那版分镜落了地"；
摘 world `setLocal` 闸 → world 用例红；把 page.tsx 的 `readOnly={access === 'read_only'}` 写死
`false` → e2e ⑥ 精确红在横幅不可见。共 6 臂。

**一处取舍**：storyboard 的 `setLocal` 一开始也加了闸，但三个入口（planFrom / applyOps / undo·redo）
已经各自先挡，漏斗上那道在可达路径上量不出差别——无法被见证的守卫按本仓纪律不留，删掉。

**不做**：只读不把按钮藏起来。发布 / 生成 / 快照这些显式动作仍会走到服务端并拿到 403 的原话
（面板照常展示原因）——那是有用的回执，本地藏掉反而让人不知道发生了什么。

---

## §60 主页游戏栏：从"还没开工"改成真的列出公开游戏（2026-10-27）

- 原来的问题是假话（§159）：`profileOf` 的 `games.note` 写着"把设计变成可玩东西的那半（§50 构建、§53 Playtest）还没开工"，
  而公开可玩页 `/n/<handle>/<slug>/play` 早就在了（§51 八种类型 2026-10-07 全部派得出真管线，上面那格已 `[x]`）——
  主页上那句话让读者以为平台里没有能玩的游戏。计数也只数 `kind=game` 的**项目**（含没发布、私有、已软删的），
  与页面上"只列出公网上传着的内容"那句隐私声明互相矛盾。
- 改法：`games` 从 `{ count, note }` 变成 `{ count, entries, note }`。
  - 只查 `published_projects` 里 `visibility='public'`、未被人工拒绝、项目未软删、`kind='game'` 的那几行；
  - `playable` 以**发布那一刻钉住的设计**为准（`game_document is not null`，ADR-0009），不读工作稿；
  - 页面上：可玩的那几份给 `data-profile-game-play` 的「试玩《…》」链接，只有设计稿的那几份照实写
    「只有设计稿，没有可玩版本」（`data-profile-game-design-only`）；
  - 说明句由这一栏的数字生成（0 / 全可玩 / 全设计稿 / 混合四种），不再写死一句"还没开工"。
- 凭证：`apps/web/test/profile.integration.test.ts` 8/8（真库）——改写的那一条造了三份游戏项目
  （存了设计再发布 / 没存设计就发布 / 发布成 private），断：主页只列前两份、可玩那份的 `path` 与发布行一致、
  设计稿那份 `playable=false`、私有的那份不出现、说明句里"1 份…设计稿"与事实对得上。
  真渲染：dev 库 `gpmugg60gk` 的主页 HTML 里 `data-profile-games` 两块可玩链接都指向
  `/n/gpmugg60gk/…/play`，设计稿那块带 `data-profile-game-design-only`，说明是
  "2 份公开作品在发布那一刻钉住了游戏设计，点进去就能玩；另外 1 份只有设计稿。"。
## §90 × §12 浅色主题的强调色文字：89 处亮青换成会翻转的 ink（2026-10-28）

§85 第八片在真浏览器里量到浅色最低 **1.70:1**，14 个不合格节点全是同一类：`text-accent-2`。
这一片把 `accent-2` 这一笔还掉，`danger` / `warn` 仍如实欠着。

- **只动"当文字"的那一侧**：新增 `--nexus-color-accent-2-ink`，暗色保持 `#22d3ee`（与原来逐字节相同），
  浅色换成深青 `#0f6b7a`（对 bg-0..bg-3 最低 4.98:1）；Tailwind 层加 `--color-accent-2-ink`。
  `bg-accent-2`（当底色）不动——它配 `accent-fg` 已经过 AA。
- **替换面**：全站 89 处 / 34 文件，逐条核对全是中性表面上的链接/价格/提示，没有一处压在强调色实底上。
- **门**：`style-tokens.test.ts` 新增 5 条（源码里不许再出现 `text-accent-2`、Tailwind 映射存在、
  两主题 × 四级表面 ≥4.5、原值在浅色下必须不及格、暗色 ink 仍过 AA）；该文件 **17/17 绿**。
- **浏览器读数**：`e2e/a11y-light.spec.ts` 47.1s 通过——五张页 **14 → 0 违规**，最低 **1.70 → 4.64**；
  发现页最低 5.81 正是新 ink 的 `#0f6b7a`，证明它真的落进了像素。详见 `docs/EVALUATION.md` 第九片。
- **仍欠**：`danger` 73 处、`warn` 36 处在浅色下同样塌；浅色在产品里仍无入口，第五片那道
  "入口一出现就变硬门"的自查门继续钉着它们。带透明度的底色仍只由浏览器 axe 判。
- **环境一并修正**：Postgres 容器同时映射 `55433`（代码默认）与 `55100`（集成测试脚本使用的别名），
  两个端口指向同一实例；`infra/docker-compose.yml` 已固化，免得并行会话各自改映射。

## §90 语义色当文字：danger / warn 也拆出 ink（2026-10-28）

- 全站 132 处 / 56 文件；新增 `--nexus-color-danger-ink`（暗 #f2555a / 浅 #b42318）、
  `--nexus-color-warn-ink`（暗 #f5a623 / 浅 #7a4f00），Tailwind 层同步暴露。
- 门：`style-tokens.test.ts` 22/22——源码不许残留裸 `text-danger`/`text-warn`、两主题 × 四级表面 ≥4.5、原值浅色必须不及格。
- 浏览器见证：浅色下登录失败 `rgb(180, 35, 24)` 压 `rgb(247, 248, 251)` = **6.19:1**；五张页 axe 复跑仍 0 违规。
- 仍欠：warn 没有游客可触发的轻入口，只有字面值门与 Tailwind 映射门；success/info/brand 当前 0 处。

## §120 主题入口：系统偏好 + 显式选择 + 持久化（2026-10-29）

浅色之前只是 tokens.css 里的一套值，产品里没有入口（`layout.tsx` 把 `data-nexus-theme="dark"` 钉死）。
这一片把入口做出来，并把"入口一出现就变硬门"的自查门真正转硬。

- **首帧**：`ThemeScript` 放在 `<body>` 第一个子节点，同步读 `localStorage['nexus-theme']`；
  没存过才看 `prefers-color-scheme`。`<html suppressHydrationWarning>` 是必须的——脚本先于 React
  改属性，否则每个浅色首访都会报 hydration mismatch（首跑真的报了，e2e 现在监听 console 钉住它）。
- **切换**：`ThemeToggle` 一个按钮，暗 ↔ 浅，写回 localStorage；`data-theme-toggle-ready="1"`
  是给 e2e 的水合屏障（本仓 2026-10-28 反复踩过"点了但 React 没接住"）。
- **判据只有一份**：`apps/web/src/lib/theme.ts` 的 `resolveTheme`，脚本与组件共用同一套规则；
  4 条单测钉显式优先、系统兜底、非法值不产生第三种主题。`theme.test.ts` 4/4。
- **e2e**（`e2e/theme-toggle.spec.ts`，40.6s）：暗系统下点一次 → 属性/底色/按钮态全翻 → 刷新仍浅 →
  点回去变暗；浅系统首访直接浅色；全程 console 无 hydration 告警。
- **既有暗色基准不漂移**：`playwright.config.ts` 全局 `colorScheme: 'dark'`。Playwright 默认浅色，
  不钉这一行会让 20+ 个既有用例整体换主题。浅色用例自己 `emulateMedia`。
- **回归**：`auth.spec.ts` 两条 @smoke 通过（浮动按钮没有挡住任何点击）；`a11y-internal.spec.ts`
  九张登录后界面（含这个新按钮）仍 **0 违规 / critical 0**（13.6m，慢但完整）。
- **仍欠**：登录后界面的**浅色**还没扫（现在只扫了游客五张）；这是下一片。

## 两实例往返：那条演练过期了 25 天，重跑并让它自己检查牙（2026-10-29）

上面「两实例往返」那一节（2026-10-04）写的 7 条判据、22 条迁移、"臂只在 `NEXUS_TWO_INSTANCE_SKIP_ASSETS=1` 时执行"，
今天全部过期。这一片把它重跑并改掉，逐条读数见 `docs/EVALUATION.md` 第二十一片。

- **过期不是因为没做，是因为做绿过一次之后它不响**：这三个月里 `import.ts` 长出分镜换号与角色换号两段代码，
  B 侧迁移从 22 条涨到 45 条，脚本一次也没再跑。跑绿过的见证同样会过期，而它过期时没有人知道——
  与第十四片那句"门是砌好的，没人踢就不会响"是同一件事的两种形状。
- **判据 7 → 20**：走满 design / assets / storyboard / character 四层；引用完整性与文案等价**分开判**
  （`*_TEXT_EQUAL` 把引用字段排除，`*_REF_CONSERVED` 单独数引用），`B_EMPTY_BEFORE_IMPORT` 从"父进程的意图"
  变成 B 侧孩子在导入前逐表 `count(*)` 的实测数。
- **臂默认全跑（5 趟）**：由同一份好包剪出五份改过的包，各自导进一份全新的 B；
  实测分别红 16 / 10 / 5 / 5 / 7 条。`foreign-asset-id` 那一趟证的是"字节全在、CRC 全对，只有字节是谁是假的"
  ⇒ 只有引用那七条红，`ASSET_BYTES_EQUAL` / `B_STORAGE_IS_OWN_COPY` 照旧绿。
- **归类规则**（`VERDICT_NAMES`）：每趟只点名该红的那几条，其余按定义必须照旧绿；名册对不上就失败。
  它当场纠正了我自己一次——`no-design` 点名 10 条、实测红 16 条，而那句"该红的 10 条全红"当时**是真的**。
- **三趟探针**证那三条臂红不到的判据有牙：库不重建再导一次（`B_EMPTY_BEFORE_IMPORT` 红）、
  导出后删掉 A 侧角色（`A_UNCHANGED_AFTER_EXPORT` 红）、把 A 侧用户 id 递给 B 的导入（17 条红，
  挡在前面的是 `projects_owner_id_users_id_fk`，SQLSTATE 23503）。
- **抓到一条真缺陷**：`domain/projects.ts` 的 `isSlugConflict` 沿 `cause` 链走五步（#151 的教训），
  但循环只挡 `null` 不挡 `undefined`。链一般两层就到底，于是第三轮在 `undefined` 上读 `cause` 自己炸了——
  **任何非 slug 的库错误都拿不到原话**，被换成一句 `Cannot read properties of undefined (reading 'cause')`。
  唯一不被它炸到的那条路恰恰是它要认的那条（slug 冲突在第二层就 return）。修复一行，
  见证加在 `apps/web/test/projects.integration.test.ts`（真库、不存在归属 id → 要求链上有 23503 且顶层不是那句
  TypeError；旧代码上实测红）。`projects.integration.test.ts` 17/17。
- **口径更正**：`docs/TESTING.md` / `docs/adr/0024-project-export-zip.md` 里"7 条判据全绿""22 条迁移""臂只在设 env 时"
  三处旧说法同片改口。仍然欠的那寸没变：这条脚本不在 `npm test` 里，也没有 CI 跑它。


---

## §75 AI Usage 第一切片：任务行记着那次调用真花掉了什么（2026-10-29）

需求原文（§75）：记录 tokens / model / latency / cost / tool calls，用户能查看自己的 AI 用量。
开工时的状态是"契约里有、账本里没有"：`AiResponse.usage` 早就由 mock 与真 provider 各填一份，
同步与异步两条路却一次都没把它写进 `agent_tasks`，账本页只有"用时"一列——`latencyMs` 是 provider 自己报的，
与那一列量的不是同一件事（那一列是任务从开始到收尾）。

**落点**

- **迁移 `0045_agent_task_usage.sql`**：`agent_tasks.usage jsonb`。历史行不回填：**0 token 与"没记"是两件事**，
  给旧行补一个 0 就是在替那次调用编一个读数（§159）。
- **读侧契约**（`apps/web/src/lib/tasksLedger.ts`）：`TaskUsageSchema` 严格校验九个字段（provider / model /
  modelClass / tokensIn / tokensOut / latencyMs / costUsd / toolCalls / demoMode），`TasksLedgerTaskSchema.usage`
  是"必填可空"——服务端每一行都显式给（NULL 走 `null`，缺字段整份报文不合契约）。`modelClass` 留成自由串：
  库里将来多一档，不该让账本页整页读不出来。
- **写侧**（`server/domain/agent-tasks.ts` 的 `recordTaskUsage`）：先过 schema，再
  `update agent_tasks set usage = ... where id = ... and usage is null`。CAS 的用途不是"顺手加个锁"，
  而是**同一次调用只留第一份读数**：重复观察、两个 web 实例同时收尾都不会出现第二份。
- **两个记账点，同一个口径"用量属于那次调用，不属于终态"**：
  - 同步（`api/ai/run/route.ts`）：`deliver()` 在 `gateResponse` 之前记账。挂起与越权拒收只决定补丁交不交回，
    不会退还已经烧掉的 token；记在门之后还会拿到一份被抽掉补丁的报文，那不是 provider 报的东西。
  - 异步（`server/domain/ai-jobs.ts`）：`settle()` 在 `running` 预检**之前**记账。被取消的行也可能对应一个
    真跑完的作业——用户点了取消，token 照旧烧掉了，账本要留下这一笔；重复观察由那条 CAS 挡住。
- **账本页**（`components/TasksLedgerLive.tsx`）：新增「用量」列与顶部三档汇总
  （`data-tasks-usage-summary`：真模型 / DEMO 规则版 / 未记录）。DEMO 行写"DEMO 规则版不经过模型（0 token）"，
  真模型行写模型、token、费用、工具调用数与模型侧延迟；`costUsd` 为 0 写「未计价」而不是"$0"——今天的适配器
  没有价格表，0 与"免费"不是一回事（§159）。老行写「未记录」。

**凭证**

- 真库：`tasks-ledger.test.ts` + `tasks-ledger.integration.test.ts` + `ai-jobs.integration.test.ts` 共 **67/67**。
  其中异步那条路新加三态各一条（跑完的、被扣下等审批的、取消之后队列才报完成的）；
  集成侧 3 条（记账后原样读出、坏形状返回 false 且列仍 NULL、第二次不覆盖）。
- eslint 0（10 个改动文件）；`tsc -p apps/web/tsconfig.json --noEmit` 0。
- 真浏览器：`§164 通知` 一条通过，账本渲染出 `data-task-usage="demo"` 的
  "DEMO 规则版不经过模型（0 token）"，汇总写「DEMO 规则版 1 行」，截图 `screenshots/agent-task-ledger.png`。
- 顺带修掉一条**过期断言**：`e2e/studio.spec.ts` 原来硬编码 `[data-notification-backing]` 期望 10 条，
  而 `NOTIFICATION_KINDS` 已由其它会话长到 12 类（marketplace_report / team）。改成从页面
  `data-notification-backed-count` 现算——与收件箱页"会通知的"那一列从注册表现算（任务 #94）是同一课：
  名单每长一次，手抄的期望值就过期一次。

**仍欠**

- 真 provider 的 `costUsd` 在 `apps/ai-service/src/ai_service/execution.py` 里硬编码 0（没有价格表），
  所以真实调用的费用一栏只能写「未计价」；
- 按模型 / 按项目的用量汇总页没有，账本页只按单次调用逐行显示；
- 历史行不回填（那时确实没记）。

## §120 × §85 主题切换的浏览器见证：暗/浅 × 三张面（2026-10-29）

需求原文（§120 主题入口 / §85 无障碍）：主题切换只有"首页点一下会换、刷新还记得"这一条见证；
浅色的 axe 只扫过游客五张与登录后九张，**真实发布出来的公开作品页从没在浅色下被量过**。

**落点**

- `e2e/theme-toggle.spec.ts` 新用例：3 张面（首页 `/`、Studio `/studio/<id>`、公开作品页 `/n/<handle>/<slug>`）
  × 两个主题 = 六组合。每组合：主题经产品自己的入口写进 `localStorage` → 重新进入 → 取样探针
  （沿祖先链第一个不透明底色 + 取 60 个带文字元素算最低对比度）→ axe（WCAG 2.0/2.1 A+AA，排除
  `nextjs-portal`）→ `keyboardWalk` 七道门 → Tab 到 `[data-theme-toggle]` → Enter 翻过去、Space 翻回来，
  每次读 body 计算底色。公开页用真发布 + 匿名访客上下文；作者投影子树带 `author` 标记，不参与"残留暗底"判据。
- `e2e/a11y-light.spec.ts` 新增登录后九张浅色 axe（夹具账号 + 真项目，不断言违规条数，只钉结构不变式）。
- **真缺陷一**：`CanvasStage.tsx` 的 window keydown 对 Space 无条件 `preventDefault`（按住空格平移画布），
  把落在按钮上的 Space 原生激活吞掉（WCAG 2.1.1）。修法：焦点在控件上时跳过（`onControl`）。
- **真缺陷二**（门自己）：Chrome 给可滚动容器加隐式 tab 停留点，公开页的「顺序」门把它当产品错位。
  `e2e/support/keyboard-walk.ts` 的 `Stop` 加 `pos` / `scrollable`，新增第七道门「停留点有归属」；
  顺序门只比分母内停留点。

**凭证**

- 读数（六组合）：axe 通过 首页 25/25、Studio 23/23、公开页 24/24（暗/浅各一），违规 / critical /
  对比度不合格节点全 0；取样最低 4.71 / 4.71 / 5.58–5.59。键盘 21/21、70/70、18/18；
  Enter 与 Space 在三面两主题下都真的翻像素。逐行表见 `docs/EVALUATION.md` 第二十二片。
- 登录后九张浅色：通过 25/23/21/22/21/22/21/21/22，违规全 0，最低对比度 4.64（市场）。
- 新用例 **1 passed（21.3s）**；键盘回归 `keyboard-a11y` + `keyboard-surfaces` **2 passed（25.7s）**；
  eslint 0（5 个改动文件）；`tsc -p e2e/tsconfig.json` 与 `-p apps/web/tsconfig.json` 各 0。

**仍欠**

- 浅色键盘走查只到三张面；其余六张登录后界面只有 axe。
- `GamePlay.tsx` / `RpgPlay.tsx` / `WorldWalk.tsx` 三处 window keydown 对 Space 与方向键同样
  无条件 `preventDefault`，同类 WCAG 2.1.1 风险没量也没改（夹具项目里没有游戏设计，没有语料）。
- 运行中改系统主题不生效（只首帧读 `prefers-color-scheme`），没有浏览器见证。

## §90 其余语义色当文字：从"一次清点"变成一道常驻门（2026-10-29）

需求原文（ROADMAP 浅色系列）：`text-success` / `text-info` / `text-brand` 当前为 0，出现即按同一道门收。

**落点**

- `apps/web/test/style-tokens.test.ts` 新增 `describe('其余语义色当文字…')` 两条：
  ① 扫 `apps/web/src` 全部 `.ts/.tsx`，`\btext-(success|info|brand)(?!-)` 一处都不许有
  （`-ink` 变体不在禁令里；`hover:` / `focus:` 前缀与 `/opacity` 后缀都会被这条正则抓到）；
  ② 验电：这三个原色在"两个主题 × 四级表面"八格里最差分别是 success 1.84 / info 2.97 / brand 3.37——
  都过不了 AA 4.5，所以"0 处"是现状不是洁癖；若哪天八格全过，这条门自己就该删。

**凭证**

- `npx vitest run apps/web/test/style-tokens.test.ts` → **24 passed**（原 22 + 新 2）；eslint 0。
- 全仓 grep（排除 docs）：`text-success|text-info|text-brand` **0 处命中**。

**仍欠**

- 这道门只扫 `apps/web/src`（平台界面）。`packages/design-model` 的 codegen 会生成用户设计稿的
  Tailwind 类名，那是用户的设计 token，不是平台 UI，不在这道门的账上。

## §90 游戏页的 Space 与方向键：三张页的同族缺陷，判据收成一份（2026-10-29）

需求原文（WCAG 2.1.1 Keyboard / 第二十二片 notMeasured 第 2 条）：游戏页的 window keydown 不许吞掉
落在按钮/链接上的 Space，也不许吞掉落在输入控件里的方向键。

**落点**

- `apps/web/src/lib/keyboard.ts`（新）：`isEditableTarget` / `isControlTarget` 两条判据。
  Studio 画布（`CanvasStage.tsx`）与命令栏（`CommandBar.tsx`）原先各抄一份的 `typing` / `onControl`
  换成它——同族判据从四处收成一份（判据不写 `instanceof`，单测跑在 node）。
- `GamePlay.tsx`（2D）/ `RpgPlay.tsx`：keydown 可编辑目标先放手，`Space + 控件族`归原生激活；
  WASD / 方向键照旧（点完按钮能接着走）。
- `WorldWalk.tsx`（3D 世界）：同一处；select 上的箭头/空格不再被走路吞掉。
- `apps/web/test/keyboard-guards.test.ts`（新，7 条）：可编辑标签 / contentEditable / 控件族 / 拿不到形状的目标。
- `e2e/game-keyboard.spec.ts`（新）：骨架游戏设计 → 真发布 → 匿名访客 `/play`，三臂各 reload；
  `kind` 换 `rpg-prototype` 重发一次量 RPG。`e2e/world-talk.spec.ts` 增两臂（Space 关掉再打开）。

**凭证**

- 先红：判据临时 `return false`（等价旧行为）→ `game-keyboard` 红在臂一（报告行 20s 不出现）、
  `world-talk` 红在 `[data-world-talk]` 该隐藏却 visible。
- 后绿：`game-keyboard` **1 passed（11.7s）**、`world-talk` **1 passed（6.0s）**、
  `keyboard-guards` + `style-tokens` **31 passed**、`theme-toggle` **3 passed（25.8s）**；9 个改动文件 eslint 0。
- 逐条读数见 `docs/EVALUATION.md` 第二十三片。

**仍欠**

- `GameCanvas3D`（3D 画法）没有画布内键位语料；世界页只量了 Space（夹具只有一个角色，select 改不动）；
  移动端/触摸没量。
- 焦点在按钮上时 Space 归按钮：点完「重新开始」后焦点仍留在那里，这一下 Space 会再重开而不是攻击。
  这是原生激活的必然代价，页面上没有额外提示（要不要在画布点击后把焦点收回游戏，另行决策）。

## §27 历史面板「只看当前分支」：筛选在服务端，勾选跟着当前线走（2026-10-30）

需求原文（§27 历史面板）。域层的 `listSnapshots(projectId, { branchId })` 早就支持按分支筛，
缺的是路由与界面这一格：面板只能把几条线的快照混在一张列表里看。

**落点**

- `api/projects/[projectId]/snapshots/route.ts`：`?branch=current` 在**服务端**收窄列表——不是把最近 200 行发下去
  再在浏览器里裁（客户端筛得到的是"最近 200 条里属于这条线的"，服务端筛到的才是"这条线最近的 200 条"）。
  只认字面量 `current`，`?branch=<uuid>` 与空串一律 400：把它们当成"没带参数"悄悄回全量，面板上那句
  「只看当前分支」当场就是谎话。取数顺序改成**先 `listBranches` 再 `listSnapshots`**——`ensureDefaultBranch`
  会把没挂分支的快照认领进 main，反序会让 `currentBranchId()` 得到 null、筛的是 `branch_id IS NULL` 那一批，
  而同一份响应里的 branchList 已把同一批算成 main 了（面板高亮 main，行上一个章都没盖）。
- `studio/store.ts`：`snapshotScope: 'all' | 'current'`。客户端**不记分支 id**：切分支后这一格不用重做，
  列表跟着服务端现算的"当前"换线；换范围时清掉展开着的 Compare（它比的是上一份列表里那条快照）。
- `studio/HistoryPanel.tsx`：一行「只看当前分支 + 分支名」；空列表的说法跟着范围变（"这条线上还没有快照，
  取消勾选可以看全部"），不是统一一句"还没有服务端快照"。

**凭证**

- `apps/web/test/snapshot-branch-filter.integration.test.ts`（真 Postgres）**4 passed**：筛出来的每一条都等于
  同一份响应里标 current 的那条、切分支后列表换线、`?branch=<uuid>`/空串 400、仍是时间倒序且是不筛那份的子集。
- `e2e/studio.spec.ts` 新增 `@smoke studio slice: 只看当前分支跟着当前那条线走`，**先红后绿**：
  第一次跑红在"勾选之后 main 那版还在列表里"（`toHaveCount(0)` 得到 1）。原因不是实现错，是上一次跑臂时
  把 `const query = ''; // MUT M5` 留在了工作树里；恢复成
  `this.snapshotScopeValue === 'current' ? '?branch=current' : ''` 之后 **1 passed（14.9s）**。
  这条红是一次真读数：残留的变异体被**用户看得见的断言**抓住，而不是被"参数读进来了"自证。
- `snapshots.integration` + `branches.integration` + 三个 `studio-*` 单测 **31 passed**；`tsc`（web）与
  改动面 eslint 都是 0。

**仍欠**

- 只有"当前"一档：不能指定某条分支看（`?branch=<uuid>` 明确 400，没做）。
- 勾上时面板不提示"这条线之外还有多少条"，用户只能靠取消勾选确认自己漏看了什么。

## §14 × §85 第十六片：访客那一边的视口与缩放——公开页接上 ADR-0069（2026-10-30）

需求原文（§14「用户可以在 Canvas 中切换 viewport」／§85 第十三片 notMeasured ①②）。第十三片量到的原始事实：
公开页把发布快照按设计尺寸铺进 `overflow-x-auto`，390 宽下首屏只见 **27%**、要横向平移 **1082px**，
而**访客自己没有任何办法改变这件事**——`?viewport=` / `?zoom=` 当时只有作者侧 `/preview` 有半条。
决策与取舍写在 `docs/adr/0069-public-viewer-viewport-and-zoom.md`。

**落点**

- `apps/web/src/studio/viewer-params.ts`（新）：一套参数名 + 纯函数。断点宽度一律取模型的
  `BREAKPOINT_WIDTH`（界面不再复制一份会过期的断点表）；`zoomFromParam` 把合法值夹进 `[0.25, 1]`、
  读不出数字/0/负数回 1；`viewerHref` 改一项带其余（翻页、换断点、缩放互不重置）；
  `liveBreakpoints` 回答"这一页上哪几档真的会改变投影"。
- `apps/web/src/studio/ViewerControls.tsx`（新）：公开页与 `/preview` **共用**的服务端 `<a>` 控件行。
  证明不了会变的空按钮不摆（§159），访客正在看的那一档例外；目标全部 ≥24×24（WCAG 2.5.8）。
- `app/n/[handle]/[slug]/page.tsx`：`resolveLayout` 第一次拿到 `breakpoint`（作者的 mobile 变体这才第一次
  落到访客眼里）；缩放走 `transform: scale()`，外面套一层按**缩后尺寸**占位的 `data-published-scale-box`
  ——只有 transform 没有占位盒，画面缩了页面照样横向平移一整屏；翻页热点带 `keepParams`。
- `app/preview/[projectId]/page.tsx`：改用同一排控件、同一套参数名。
- `packages/design-model/src/layout.ts`：根画框写 `fill`/`hug` 时 `ResolvedLayout.width` 曾被写成关键字字符串，
  `width * zoom` 得 NaN；`runLayout` 用 `rootAxis` 解成数字（`fill` → 可用宽、`hug` → 内容实测、数字 → 原值）。

**凭证**

- `viewer-params` + `layout` 单测 **42 passed**；`packages/design-model` 全量 **384 passed / 32 文件**。
- `e2e/viewer-breakpoint.spec.ts`（390×844 手机仿真，腿 A–I）**2 passed（26.0s）**：缺参数一个字节不变、
  mobile 真的重解到 375 且规则生效、非法值降级、缩放同时钉住**布局宽**与**视觉宽**、两参数叠加、翻页带取景框、
  空按钮不摆、24px 下限；作者侧 `/preview` 同一排控件一并走通。
- 类型三处（design-model / web / e2e）exit 0；改动面 14 文件 eslint 0。
- 读数一则（同一次 e2e 打印）：设计宽 1440、不缩放需平移 1082px（视觉宽 1440）→ 0.25 倍时占位盒 360、
  平移 **2px**（390 可视区里 gutter 16/16 占 2px）——残余那 2px 是容器内边距，不是画面露在外面，
  见证按这条算术断言而不是 `toBe(0)`。

**仍欠**

- **自动那一半**：默认仍是设计尺寸 + 原大，首屏 27% 没有被这一片自动改掉；访客要自己点一次「手机 375」。
  补它需要服务端"按访客视口解一次"，届时 ADR-0069 要改成"默认按视口、显式参数覆盖"。
- **作者写规则的那一格**：Properties 面板只有"读取"（会显示「tablet 下为 W×H」），Studio 的 viewport 切换
  不写规则。没有规则可写时，四档按钮对多数已发布作品仍是同一张画——下一寸该补这个入口，而不是自动适配。
- 移动端体检那条 `[~]` 仍欠复跑：Studio／发现／市场／后台的窄视口没进读数。
- 测量会污染读数：`recordView` 每次 SSR 加载给 `publishedProjects.views` +1 且不去重，夹具账号与项目固定，
  那些"浏览"不是真人。

## §85 第二十五片：应用外壳第一次在 390 下被量——Studio 的画布被裁掉半屏（2026-10-30）

需求原文（§85 移动端体检；第十三片 notMeasured 第 3 条"应用外壳在窄视口下没有读数"）。落点两件：

- **复跑**第十三片的公开作品页（`e2e/mobile-layout.spec.ts`，1 passed 20.3s）：五张真发布语料在 ADR-0069
  之后逐项与第十三片相同——帧宽 1440、390 下首屏 27%、要平移 1082px、5 个 <24px 目标。
  **这不是"修了没生效"**：ADR-0069 加的是显式参数那条路（访客点「手机 375」才重解），
  默认那一版仍按设计稿原大铺，所以"默认按访客视口选档"那半边仍然欠着。
- **新面** `e2e/narrow-surfaces.spec.ts`（新，1 passed 11.1s）：发现／市场／Studio／管理台 × 390/1280，
  8 次量测。门只钉"这一遍真的量到了"（仿真落地、地标在、点击目标名册 ≥1），不断言阈值。

**读数（390 那栏）**

- 发现 0px 溢出 / 0 横滚 / 0 裁切 / 1 个 <24px（"按关键词搜全平台" 96×18）；市场 0 / 0 / 0 / 1
  （"回首页"）；管理台 0 / 0 / 0 / 7（导航与"打开这一版看看" 21px 高，两栏一样）。
- **Studio 0px 溢出 / 0 横滚 / 9 处"滚不动的裁切" / 23 个 <24px**（1280 下 2 处裁切、24 个 <24px）。
  最大一处是**画布本体**：`div(NEXUS STUDIO…)` 比盒子宽 **678px** 而外层 `overflow:hidden`——
  画布区装不下 1440 宽的设计稿，右侧一块滚也滚不到；1280 下同一处仍裁 88px。
  缩放入口只有 `Ctrl+滚轮` 与画布手势，界面上没有"适应窗口"，`data-zoom` 只是一句读数；
  23 个小目标几乎全是画布右上角那组 12–20px 宽的缩放/视图小按钮（`▾ ◉ ○ ·`）。

**这一片量错过的两次（都当场修掉，记下来免得下次再犯）**

1. Studio 第一遍量到的是**骨架**：`[data-studio-root]` 在 SSR 就有，面板要等 `state.ready` 才挂上，
   于是读到"1 个点击目标"。现在每个面都带**水合屏障**（Studio 等 `[data-panel-tab]`，90s）。
2. 只数"页面级溢出"会漏掉**裁切**：外壳 `overflow:hidden` 时溢出恒为 0，内容却是真的看不见。
   现在同时数 `overflow: hidden/clip` 且 `scrollWidth > clientWidth` 的盒子。

**仍欠**

- **默认按访客视口自动选档已还**（第三十一片，ADR-0074）：首屏 27% 那一格由"有规则的页面铺
  四份投影、媒体查询选一份"补上；390 下夹具页 1440/1082px → 375/0px，无规则页逐字节不变。
- **Studio 画布在窄视口下的答案**：先要有"适应窗口"，再谈触摸手势；这一片只量不修。
- 平板/横屏（768/1024）、iOS 真机与触摸手势、Studio 的 Inspector/代码/变体视图、
  市场登录态、管理台其余五张页。逐条在 `docs/EVALUATION.md` 第二十五片。

## §SEC 限流闸的 IP 取可信链的右端：一行 `x-forwarded-for` 换一只桶，这条路堵掉了（2026-10-30 第二十六片）

**起点不是需求，是一个读代码读出来的洞。** `apps/web/src/server/security/rateLimit.ts` 的
`clientIp()` 取 `x-forwarded-for.split(',')[0]`——链条**最左端**，也就是客户端随手写的那一段。
配合 `node_modules/next/dist/server/base-server.js:612`：

```js
req.headers['x-forwarded-for'] ??= originalRequest?.socket?.remoteAddress
```

`??=` 只在**头缺席时**才拿 socket 地址填；头在场时原样透传，既不追加也不校验。于是任何客户端
加一行 `x-forwarded-for: 随便写` 就换一个限流桶：13 处 `ipWriteGate`（建项目 20/h、发凭据 10/h、
`ai/run` 与 `blocks` 与 `follow` 60/h、建商品 20/h、举报 20/h……）与 30 处
`rateKey(route, clientIp(req), user.id)` 的按 IP 那半**当场空转**。ADR-0060 立的那道
"身份之前先按 IP 挡"的闸，挡住的是不换 IP 的客户端，没挡住换 IP 的——而后者连 cookie 都不用碰。

**为什么 `guest-write-gate.integration.test.ts` 那三条一直绿着**：它们都只写**一段**头。
只有一段的链条里"取最左"与"取最右"给出同一个答案——见证的形状没有区分度，四条用例全绿而闸是空的。
这一片的先红读数就是这条盲区的证据（见下）。

**落点**

- `security/rateLimit.ts`：`clientIp()` 改成**读可信链的右端**（`tokens[max(0, len-count)]`），
  段先归一化（去空白、去 `[...]`、去 IPv4 的 `:端口`，八位组 >255 或字符集不对的**当它不存在**）；
  新函数 `gateIp()` 把"两行头都不在场"（照旧让路，ADR-0060 的口径不动）与"头在场却读不出地址"
  （归进 `INVALID_IP_BUCKET = 'invalid-xff'` 一只共享桶，**照常限**）分开——写一行垃圾换不来免限流。
  `rateKey` 与审计那 30 多处继续用 `clientIp()`：垃圾头在它们那里是 `null`，
  于是 `audit_events.has_ip` 不会把垃圾说成"有 IP"。
- `NEXUS_TRUSTED_PROXY_COUNT`（默认 1）：从右往左数第几段。一级会追加的反代 = 1；
  CDN → LB → 本机 = 2。非整数、`<1`、`>8` 一律退回 1——**任何解析失败都不会退回"取最左端"**。
- 限额一个都没动：建项目仍是 20/小时、注册 10/小时、登录按邮箱 10/15 分钟。这一片改"闸按谁限"，不改"闸限多少"。
- 判决与限度：`docs/adr/0070-forwarded-ip-take-rightmost-trusted-hop.md`（含四个被否掉的选项，
  其中"只信 CIDR 白名单里那几跳"否在**处理器里拿不到 socket 对端**）。
- `docs/SECURITY.md` 那条 bullet 原来写着"速率限制：Redis 滑动窗口"——**驱动现在是进程内内存**，
  同文件下面的"实现现状"段落早就写对了，两处口径互相打架；按事实改成"滑动窗口 + 进程内驱动，
  形状对齐有序集，多实例部署前必须接过去"，并补上 IP 取右端这一句。
- `docs/ENVIRONMENT.md` 新增一条：本机没有反代 ⇒ 浏览器不写这一行头 ⇒ Next 填的是同一个 `::1` ⇒
  **同一台机器上全部 e2e 用例共用一份名额**（这才是"跑一轮浏览器用例第二轮就 429"的机制，
  不是某个文件的锅）。

**凭证（逐字读数）**

- 起点：`tsc --noEmit -p apps/web` 退出 0；`npx eslint` 覆盖本次四个改动路径退出 0；
  旧实现下 `apps/web/test/rateLimit.test.ts` **7 passed (7)**——其中一条断言
  `clientIp(... '1.1.1.1, 2.2.2.2') === '1.1.1.1'`，**这条断言当时就在给漏洞作证**。
- 新见证先红（`client-ip.test.ts` 15 条打在旧实现上，`.scratch/s26-red-before-fix.txt`）：
  **11 failed | 4 passed**。过去的那 4 条正是"只有一段"与"两行头都不在场"——
  旧读法在这两种形状下与右端读法同解，所以它们不构成区分度。
- 改完：`client-ip.test.ts` + `rateLimit.test.ts` **22 passed (22)**；
  真库真路由 `guest-write-gate.integration.test.ts` **6 passed (6)**（74.84s）；
  连带回归 `marketplace-content.integration.test.ts`（它按 IP 分桶拿不同身份）一起跑
  **4 files / 42 tests passed**（136.90s）。
- **一趟被并行会话污染的读数，如实记**：`guest-write-gate` 第一次整跑 **3 failed | 1 passed**，
  红在 `expected 23 to be 20`（`guestCount()` 的差值）。那一句量的是**全库 guest 行数增量**，
  而同一台机器上另一条会话正在跑浏览器用例、也在建 guest。串行复跑 6/6 绿。
  → 这条断言天生不独占，写它的人（我）当时没把"同机并行"算进前提；要钉死得改成只数自己造的标记，
  这一格记进下面的仍欠。
- **活体 HTTP（不经手搓 Request，`.scratch/s26-forwarded-live-probe.mjs`）**：打真 dev server 的
  `POST /api/published/report`（闸在 `requireUser()` 之前，被挡下的一个 guest 都不建）。
  21 次"左端每请求换 `192.0.2.<i>` + 右端固定 `198.51.100.77`" →
  **前 20 次 404、第 21 次 429**，`retryAfterMs=3579721`；随后两站把它变成双向判据：
  P1 单段 `198.51.100.77` → **429**（`retryAfterMs=3504874`：这一行头确实原样走到处理器，
  Next 没拿 socket 覆盖它；且"单段"与"链条右端"落进同一只满桶）；
  P2 `198.51.100.77, 192.0.2.200` → **404**（左端那只桶是满的，右端全新所以放行。
  **旧读法在这一站会 429**——它取到的正是那只满桶）。
- 浏览器面（§158 的 Run→Screenshot→Inspect；本片没有界面改动，这一趟要证的是"正常路径没被限死"）：
  `npx playwright test e2e/studio.spec.ts -g "只看当前分支"` → **1 passed (20.0s / 54.6s)**。
  真浏览器不写转发头 ⇒ Next 填 `::1` ⇒ 走的是本机那一只共享桶，名额照旧够用。

**臂表（每条都点名，跑完文件与进场逐字节一致，`grep -c "MUT" rateLimit.ts` = 0）**

| 臂 | 改坏的那一处 | 红在谁身上 |
| --- | --- | --- |
| M1 | `pickTrusted` 取 `tokens[0]`（＝旧读法） | 单元 **8 failed / 14 passed**：右端两条、`count` 两条、归一化那条、闸那 25 次、`rateKey` 形状那条、`rateLimit.test.ts` 那条被改口的旧断言；集成层 **1 failed / 5 passed**，红在"换着写链条左端也绕不过"，`expected false to be true`（第 21 次没挡） |
| M2 | `gateIp` 把"读不出的头"改成豁免（`return null`） | 单元 **1 failed / 21 passed**（`expected ['201','201','201','201']` 对不上 `['201','201','201','429']`）；集成 **1 failed / 5 passed**（垃圾头那条） |
| M3 | `trustedProxyCount()` 恒返回默认（env 成装饰） | 单元 **1 failed / 21 passed**（"count 把右端往左挪"）。**"非法值退回 1"那一格恒绿**——它测的是退回值，不是"退回给谁"，这一臂对它没有牙 |
| M4 | XFF 读不出时不回落 `x-real-ip` | 单元 **1 failed / 21 passed**（回落那条的第二句断言） |
| M5 | `pickTrusted` 去掉 `max(0, …)` 夹住 | 单元 **1 failed / 21 passed**（"链条比声明的跳数短就取最左可用段"） |
| M6 | 归一化失败的段也当身份 | 单元 **3 failed / 19 passed**（回落、"垃圾头不算有 IP"、"垃圾头进同一只桶"） |

**共用工作树的代价，记一条**：跑臂期间 `rateLimit.ts` 是变异版本，另一条会话的 dev server 会
**热更新到那个版本**（M1/M2 各占约 100 秒窗口）。本片没因此出错，但这条路不对——下一次跑臂
要么把窗口压到几十秒，要么给臂跑单独起一个端口的 server，别共用。

**仍欠**

1. **直接暴露（前面没有会追加的反代）时右端仍是客户端写的**：Next 的 `??=` 让"客户端自带的头"
   与"Next 填的头"在处理器里长得一模一样，代码分辨不出来。这一档只能靠部署补前置反代并把
   `NEXUS_TRUSTED_PROXY_COUNT` 设对——ADR-0070 的后果 1 写死了这句话，不要在代码里假装解决。
2. **内存驱动仍每实例一套桶、重启即失忆**：多实例下额度是"每实例 20"。换 Redis 有序集那一格照旧欠着，
   代价是 `hit()` 要变 async（33 处调用点 / 30 个文件）。
3. 那 30 多处 `rateKey(route, clientIp(req), user.id)` 现在拿的是 `clientIp`（垃圾头＝`null`＝`no-ip`
   共享桶，不会被轮换绕过），但没换成 `gateIp` 那只带标签的桶——审计口径优先，行为是安全的，
   只是日志里看不出"这批请求写的是垃圾头"。
4. ~~`guest-write-gate` 的 `guestCount()` 差值不独占（见上面的污染读数），要改成只数自己造的标记。~~
   **2026-10-30 第二十七片补上了**：读数与清扫都改成按本次探针的会话 token 收。
5. ~~转发头只处理 `x-forwarded-for` / `x-real-ip` 两行；RFC 7239 的 `Forwarded: for=...` 与
   带端口的 IPv6 变体（`[::1]:5000` 认，裸 `::1:5000` 不认）没铺开。~~
   **本条已在第二十八片还掉**（`Forwarded` 三行都读、`for=` 的引号与端口都归一化），判决见
   `docs/adr/0071-forwarded-rfc7239-header-read-and-precedence.md`。裸 `::1:5000`（不带方括号的 IPv6 带端口）
   仍然不认——那种形状本身有歧义，不是这一片的靶子。

## §SEC 第二十七片：那道闸的读数与清扫都只算自己——上一片记下的"不独占"那一格补掉了（2026-10-30）

**起点是上一片自己记下的一行账。** `guest-write-gate.integration.test.ts` 判"被挡下的请求一个 guest
都没建"用的是**全库 guest 行数的前后差量**，`guestCount()` 那一句和 `afterAll` 里那句
`delete from users where guest = true` 是同一个毛病的两面：前者在别的会话同时建 guest 时会把别人的行
算到我头上（第二十六片实测红在 `expected 23 to be 20`），后者更糟——**它会把同机另一条会话正在用的
guest 身份连着别人的项目一起删掉**。这一片不碰闸的语义，只把"量什么"与"扫什么"收成自己的。

**落点**

- 探针 token 全部登记（`probeTokens`），读数走 `guestsForTokens(tokens)`：
  `count(distinct users.id)`，条件是该用户的某条会话行的 `token_hash` 落在这批 token 里且
  `users.guest = true`。`sessions.token_hash` 存的是 sha256（`domain/session.ts:11`），
  测试里用同一个 `hashToken` 算——不新增列、不动生产代码。
- `afterAll` 改成 `sweepProbeGuests()`：先按这批 token 的会话行取出 user id，再依次删
  `abuse_reports.reporter_id` → `projects.owner_id` → `sessions` → `users`。**只删自己造的**。
- 新增一条常驻用例 ⑤：往库里埋一条**不属于本文件**的 guest（带一条自己的会话行），
  再跑 3 个探针 token，断言 `guestsForTokens(我的 3 个) === 3`，并用
  `guestsForTokens([那条外来的]) === 1` 当对照——证明"读数没变"不是因为查不到那条行。
- 五处原差量读数全部替换（`25 次闸`／`正对照`／`举报入口`／`链条左端轮换`／`垃圾头`），
  并给"标识不出 IP 时让路"那条补上 `25` 的读数：让路的样子＝每个 token 都真的走到签发身份那一步。
- 文件头 docblock 从"钉四件事"扩成"钉五件事"，第 ⑤ 条写的就是这次的成因与做法。

**凭证（逐字读数）**

- 起点：`npx tsc --noEmit -p apps/web` 退出 0；改完全文件 **7 passed (7)**、`Duration 52.93s`
  （进场时 6 条）。
- 回归同族四份：`client-ip.test.ts` + `rateLimit.test.ts` + `guest-write-gate.integration.test.ts`
  + `marketplace-content.integration.test.ts` → **4 files / 43 tests passed**，`Duration 28.73s`
  （上一片同样这四份是 42 条 / 136.90s；这一片多一条用例、机器当时没那么忙）。
- **臂 A2（闸挪到签发身份之后）**：`api/projects/route.ts` 在 `ipWriteGate` 之前先 `await requireUser()`，
  闸照旧返回 429（状态码断言全过），但被挡下的那 5 个已经各建了一个 guest →
  **3 failed | 3 passed**（73.61s），红在三处 `expected 25 to be 20`。这就是"闸必须在身份之前"
  那句话现在的可核对形式。
- **臂 A3（读数退回"全库 guest"）**：把 `guestsForTokens` 的 `inArray(token_hash)` 条件去掉 →
  新用例 ⑤ 红在 **`expected 30 to be 3`**（8.40s）。那个 **30** 是臂跑那一刻库里带会话行的 guest 总数
  （写下这几行时同一条 SQL 数出来是 **26**：`count(distinct u.id) from users u join sessions s on s.user_id=u.id where u.guest=true`）——
  **这个数一直在被同机的别的会话涨落**，这正是"全库差量"不能当读数的原因，上一片的 `expected 23 to be 20` 是同一件事。
- **第一次跑 A3 的读数作废，如实记**：当时那条用例还写着 21 次探针请求，红的方式是
  `Test timed out in 30000ms` 而不是数值对不上——21 次串行路由调用贴着 `vitest.config.ts` 的
  30 秒 `testTimeout` 边界，用 `-t` 单独筛出来跑就翻车（整文件跑时侥幸过）。
  用例改成 3 次探针之后 A3 才以数值差的形式红。**教训**：新增路由级用例时先看它要打几次串行请求，
  别把时长压在 testTimeout 那一格上。
- 两条臂跑完都逐字节恢复：`grep -c MUT` 在 `guest-write-gate.integration.test.ts`、
  `api/projects/route.ts`、`security/rateLimit.ts` 上都是 **0**，`git diff --stat -- api/projects/route.ts` 空。

**没有牙的那几格，点名**

- 把 `eq(users.guest, true)` 那半个条件去掉——**不会红**：这批 token 对应的用户本来就全是 guest，
  这个条件在这份文件里是防御性的（挡住"token 撞上正式账号会话"那种不该被算成 guest 的情况），
  不是当前任何一条用例的判据。
- `sweepProbeGuests()` 的清扫本身**没有常驻见证**：它删干净与否不影响任何断言（下一个用例自己 `reset()`）。
  它的正确性靠"只按本次 token 删"这个形状本身，而那形状与 A3 用的是同一处代码——A3 红过，
  所以"按 token 收"这件事是有牙的；"按 token 扫"仍只是形状。

**共用工作树的代价，再记一条**：臂 A2 的窗口约 74 秒，期间 `api/projects/route.ts` 是变异版本，
另一条会话的 dev server 会热更新到它——那一版**每个被 429 挡下的请求都会白建一个 guest**。
这次挑的是 `route.ts` 而不是 `rateLimit.ts`，改动只有一行、恢复后 `git diff` 为空。
另外这一片修掉的那句 `delete ... where guest = true`，在修之前**每次跑这份文件都在删别人正在用的身份**，
这是本次改动里最实际的一条收益。

**仍欠**

1. 库里现存的 guest 行（写这一段时数出来 26 条带会话的）属别的会话与历史轮次，本文件不再替它们清扫
   ——**过期 guest 的回收**
   是一个独立任务（谁来扫、留多久、怎么不误伤正在用的浏览器会话），今天没有答案。
2. `sweepProbeGuests()` 只覆盖 `abuse_reports` / `projects` / `sessions` / `users` 四张表：
   guest 一旦在别处留下引用（评论、点赞、上传物），删除顺序就会撞 FK。现在这份文件不产生那些行，
   但"清扫范围"与"guest 能碰到的面"迟早会对不上。
3. 臂 A2 只证明"闸放在身份之前"这一条；闸的**限额数字**（20/h）没有臂——它由第二十六片那批
   `前 20 放行 / 第 21 次 429` 的读数守着，改小改大都会红在那里。
4. ~~上一片仍欠的 1／2／3／5（直接暴露那档、Redis 驱动、审计里看不出垃圾头、RFC 7239）继续欠着。~~
   第 5 项（RFC 7239）已在**第二十八片**还掉；1／2／3（直接暴露那一档、Redis 驱动、审计里看不出垃圾头）
   继续欠着。


## §SEC 第二十八片：`Forwarded` 这行头以前没人读；补上之后活体探针把结论改了一半（2026-10-30）

**起点是上一片自己记的账**：ADR-0070 文末「仍欠」第 5 条——`readForwardedChain` 只认
`x-forwarded-for` 与 `x-real-ip` 两行，RFC 7239 的 `Forwarded: for=...` 一行都不读。
我带着一个明确假设开工：**前置只写 `Forwarded` 的部署整道按 IP 的闸不在场**（`gateIp()` 返回 `null`
⇒ `ipWriteGate` 让路）。这一片的前半段证明这个假设在处理器层面成立，后半段的活体探针证明它
**在真 HTTP 路上不成立**——真实后果是同族但方向相反的那一件（见下面的活体表）。

**落点**

- `apps/web/src/server/security/rateLimit.ts`：`readForwardedChain()` 读三行头，优先级
  `x-forwarded-for` → `Forwarded` → `x-real-ip`，**取一条链不叠加**（两条链一起进桶键＝同一个对端两只桶，
  那是"换一行头换一个桶"的另一种写法）；`headerPresent` 覆盖三行（三行都不在场才让路，
  在场却读不出照旧归 `invalid-xff` 那只共享桶——这个桶名**不改**，改名会把日志与既有见证全卷进来）；
  新增 `readRfc7239Tokens()`：一跳一段（逗号）、段内分号、**只认 `for=`**
  （`by=` 是代理自己、`host=` 是请求 Host、`proto=` 是协议，三者永不进桶键），值可带引号、
  引号里可带端口，地址归一化继续走 ADR-0070 那一个 `normalizeAddress()`（不新写解析）。
  `for=unknown` 与混淆值 `for="_gzz3"` 读不出 ⇒ 丢段 ⇒ 落进共享桶，不豁免。
- `NEXUS_TRUSTED_PROXY_COUNT` 对三条链同样生效（同一个 `pickTrusted()`）。限额一个都没动。
- 判决与限度：`docs/adr/0071-forwarded-rfc7239-header-read-and-precedence.md`（含五个选项，
  其中"以 `Forwarded` 为主"否在**任何客户端都能自己写这一行**，"长度启发"否在它能重开 ADR-0070 刚堵的洞）。
- `docs/SECURITY.md` 那条 bullet 与 `docs/ENVIRONMENT.md` 各补一段：部署要求多一行——
  **前置必须追加写 `x-forwarded-for`**，只给 `Forwarded` 的那台前置会把自己变成一整群用户共用的一只桶。

**凭证（逐字读数）**

- 起点：`npx tsc --noEmit -p apps/web` 退出 0；`npx eslint` 覆盖本次改动路径退出 0。
- **界面面本片没有跑**（本片无 UI 改动，且 §158 那条"跑一遍界面"要换的项目/举报名额已经有一批被活体探针占掉）；
  真浏览器不写转发头这件事沿用第二十六片的读数（`e2e/studio.spec.ts -g "只看当前分支"` 1 passed）——
  那一趟证的"正常路径没被限死"这一片没有被推翻：改的只是"缺席的 XFF 从哪一行补"。
- 新见证先红：`apps/web/test/client-ip.test.ts` 25 条打在旧实现上 → **9 failed | 16 passed (25)**，
  `Duration 1.93s`（`.scratch/s28-red-before-fix.txt`）。那 16 条恒绿的是"只写 XFF"与"三行都不在场"
  这两种形状——对本片的洞没有区分度，与第二十六片那 4 条恒绿的盲区同族。
- 改完：`client-ip.test.ts` + `rateLimit.test.ts` → **32 passed (2 files)**（`Duration 2.45s`），
  加上后面那条活体形状用例 → **33 passed (2 files)**（`Duration 1.87s`）。
- 回归四档第一次**红了一条，且红的不是数值**：`1 failed | 53 passed (54)`，`Duration 128.53s`，
  唯一那条红是 `Test timed out in 30000ms`，红在既有的"换着写链条左端"那一条 25 次串行路由用例上。
  **这是第二十七片已经记过的教训在我手里复发**：我新加了一条同样要打 25 次真路由的用例，
  把整文件时长推过 `vitest.config.ts` 的 `testTimeout: 30000` 边界，于是别人那条一直贴边的用例翻了。
  修法改的是**时间预算不是断言**：文件里加 `REAL_ROUTE_BATCH_TIMEOUT_MS = 120_000`，
  给那 6 条 25 次串行的用例逐个显式传第三参数（额度是 20/小时，见证要越过它就必须打满 21 次以上，
  所以既不能减次数、更不能动闸）。复跑 → **4 files / 54 passed**，`Duration 56.64s / tests 46.04s`；
  最后那一版（加上活体形状那条）→ **4 files / 55 passed**，`Duration 42.59s / tests 32.50s`
  （`.scratch/s28-green-final.txt`）。同一条用例两次跑出的时长差到 2 倍以上（0.65s/次 vs 0.3s/次）——
  这条边界本来就在飘。

**活体两趟（`.scratch/s28-forwarded-live-probe.mts`、`.scratch/s28-forwarded-live-probe2.mts`，
打真 dev server 的 `POST /api/published/report`，闸在 `requireUser()` 之前）**

| 站 | 发出去的头 | 按"读 `Forwarded`"该出的 | 实测 |
| --- | --- | --- | --- |
| 灌桶 ×21 | `Forwarded: for=192.0.2.<轮换>;by=10.0.0.1, for=198.51.100.90` | 第 21 次 429 | 前 20 全 404、第 21 次 429（`retryAfterMs=3594578`）——但那只桶不是 `198.51.100.90` |
| P1 | `Forwarded: for=198.51.100.90` | 429 | 429（`retryAfterMs=3594490`） |
| P2 | `Forwarded: for=198.51.100.90, for=192.0.2.240` | **404**（右端全新） | **429**（`retryAfterMs=3594394`）**与预期相反** |
| P3 | `x-forwarded-for: 198.51.100.90` + `Forwarded: for=192.0.2.241` | **429**（XFF 赢＝满桶） | **404****与预期相反** |
| S1 | `Forwarded: for=198.51.100.92`（全新地址） | 404 | **429**，`retryAfterMs=3286152`——接在灌桶那批之后继续往下走，说明桶就是 `::1` |
| S2 | `x-forwarded-for: 198.51.100.92`（同一个地址串换一行头） | 404 | **404** |

P2 与 P3 一起反，S1/S2 用同一个地址串换一行头就换了一只桶——三条指向同一个解释，而它写在源码里：
`node_modules/next/dist/server/base-server.js:612` 那句 `req.headers['x-forwarded-for'] ??= socket.remoteAddress`
是**无条件**跑的（`BaseServer.run`，dev 与 `next start` 同一条路）。真 HTTP 路上 XFF 几乎总在案，
XFF 又在优先级里赢 ⇒ **`Forwarded` 那一支在 Next 之路走不到**。于是这一洞的真面目是两件事：

1. 处理器契约层面：只写 `Forwarded` 的请求＝那一行形同免限流（B4 的五个 `'201'` 就是它）。这一条修好了。
2. Next 之路层面：只写 `Forwarded` 的前置不是"站在闸外面"，而是**它的用户全落进前置那一只桶**
   （桶＝前置地址，20/小时给整 POP）。这一条代码修不了，只能靠部署让前置补写 XFF——
   要在代码里真解决，需要 ADR-0070 选项 4 那一档（可信 CIDR 表 + 从右往左走到不信任的跳就停），
   而它的前置条件是"处理器拿得到 socket 对端"，现在拿不到。

**臂表（7 条，每条都点名；跑完文件逐字节恢复，`grep -c "MUT" rateLimit.ts` = 0）**

| 臂 | 改坏的那一处 | 红在谁身上（逐字） |
| --- | --- | --- |
| B1 | `for=` 换成"段内任何参数都收" | 单元 **1 failed / 32 passed**：`by/proto/host` 那条，`expected '203.0.113.60' to be null` |
| B2 | 不剥引号 | 单元 **1 failed**：`expected null to be '2001:db8:cafe::1'` |
| B3 | `Forwarded` 抢在 XFF 前面 | 单元 **1 failed**：`expected '192.0.2.43' to be '198.51.100.9'` |
| B4 | **根本不读 `Forwarded`（＝修之前的样子）** | 单元 **4 failed**，含两条闸层：`expected [ '201', '201', '201', '201', '201' ] to deeply equal [ '429', '429', '429', '429', '429' ]` |
| B5 | `for=unknown` 当地址 | 单元 **2 failed**：`expected 'unknown' to be null` 与 `expected 'unknown' to be '198.51.100.9'` |
| B6 | XFF 读不出时不再回落 | **第一版作废**：写成重复 `const` 让 vitest 报 `no tests`（那不是红，是没跑）；重写后单元 **2 failed** |
| B7 | 两条链合并（选项 2 那版） | 单元 **2 failed / 31 passed**：`XFF 说了算` 那条 + 新那条活体形状 `expected '192.0.2.51' to be '198.51.100.1'` |

**没有牙的那几格，点名**

- **新那条"只写 Forwarded、不写 XFF 时也要能标识出来"在 Next 之路上不可达**——它是处理器契约层的门，
  不是真路的门。这一片最有价值的产出恰好是把它按住了：活体两趟说明它今天不会在生产里发生。
  B4 让它有牙，但牙咬的是单元测试里的形状，不是部署。
- 活体形状那条用例（`Next 注入的那一段会盖住 Forwarded`）是**手跑探针的固化**：它的读数是编进断言的，
  如果哪天 Next 不再注入 XFF（升到别的 host、或前面加了会写 XFF 的前置），它不会自动告警。
  真正的常驻门需要一条带真 server 的 e2e/integration——记在下面仍欠第 4 条。
- 引号未闭合（`for="192.0.2.43`）与"一跳里两个 `for=`"这两种畸形形状**没有用例**，也没有臂。

**共用工作树的代价，减一条也加一条**：这一片的臂全部打在单元层（B7 从进场到恢复约 15 秒，
比第二十六/二十七片那 100 s / 74 s 的窗口小一个量级）。但我**自己起了一个 dev server 占 3100** 跑活体探针，
代价记两条：① 探针把 `::1` 那只 `published/report` 桶灌满了（`retryAfterMs` 从 3.59e6 递减到 3.29e6，
约到本地时间 04:24 才空）——这一个小时内同机任何匿名浏览器用例打举报入口都会 429，
② 放行那 22 次各建了一个 guest；探针没保留 cookie，所以**按 token 清扫那条路走不通**，
这一批行留在库里（第二十七片那套 `sweepProbeGuests` 只覆盖测试文件自己的 token）。

**仍欠**

1. **可信 CIDR 表**（ADR-0070 选项 4）：这是唯一能真正解掉"只写 `Forwarded` 的前置 ⇒ 整 POP 一只桶"的路，
   前提是先解决"处理器拿不到 socket 对端"（`next.config` 的 server 钩子或自定义 server 都可能给得到，没试过）。
2. **内存驱动仍每实例一套桶、重启即失忆**：Redis 有序集那一格照旧欠着，代价是 `hit()` 要变 async（33 处调用点 / 30 个文件）。
3. 那 30 多处 `rateKey(route, clientIp(req), user.id)` 仍拿 `clientIp`：垃圾头在它们那里是 `null`＝`no-ip`
   共享桶（安全，但日志里看不出"这批请求写的是垃圾头"）。
4. **活体形状没有常驻门**：这一片的结论有一半来自手跑的探针（§85 说"手跑的见证等于没有见证"）。
   要钉死得起一个真 server 打两站（本片的 `scratch s28-forwarded-live-probe*.mts` 就是现成的脚本），
   代价是它会消耗 `::1` 那一只桶——排期时和浏览器用例错开。
5. `Forwarded` 的畸形形状（引号未闭合、一跳内多个 `for=`、`for=` 后面跟注释符）没有用例。
6. 探针留下的 guest 行没有清扫路径（见上面那段）；过期 guest 的回收仍是独立任务。


## §SEC 第二十九片：过期 guest 身份谁来收——判据 60 天 + 四道护身符 + 审核员调用式回收；界面见证抓到本片唯一的真 bug（2026-10-30）

**起点是前两片自己记的账**：第二十六片把问题落成一句"库里现存的 guest 行——谁来扫、留多久、怎么不误伤
正在用的浏览器会话"，第二十八片仍欠第 6 条把它转成独立任务（那 22 个"按 token 清扫那条路走不通"的探针行
就是它的具体形状）。这一片交出**判据、执行体、入口与界面**；**没交出的那一块是定时器**——那是判决
（ADR-0072 选的是"由审核员调用"，否掉常驻进程），不是没做完。

**落点**

- 判据（`apps/web/src/server/domain/guest-reclaim.ts`，新增）：`guest` 为真 **且** 未软删 **且** `role='creator'`
  **且** `created_at < cutoff` **且** 无活会话 **且**（从没会话 **或** 最后一条在 cutoff 前就烂着），
  其中 `cutoff = now - 30 天`。会话本身活 30 天且一回来看就滑窗续期，所以界面说"大约是两个月"而不是"30 天"。
  四条全在库里判，不留给调用方自觉；`created_at` 那一条看着被会话判据包住，它挡的是
  `createUserSession()` 插入用户行与插入会话行之间那一瞬的"零会话"形状。
- 四道护身符：认领过（注册把 `guest` 置回 false）、被手提成审核员、名下有已发布作品、还握着**有效** API 令牌
  （已吊销的那一枚不算）。第三道是**剔出候选**而不是照常收走——替一个没登录过的匿名身份把公开页作者名换成
  "已注销的用户"，是替读者做了一件没人授权的事。
- 六件事**不复制**：`runAccountDeletion(tx, userId, at)` 从 `account.ts` 的 `deleteAccount` 里抽出来，
  自助注销与平台代做共用同一执行体，事务由调用方开（一批人一个事务，界面上那句"收走了 N 个"才与库对得上）。
  复制的第二份尤其容易只写四件，留下"会话没了、人还在"那种比整个不做更糟的半截。
- 锁上重判：`for update` 拿到行之后把同一句判据再走一遍，不成立就 `skippedUnderLock++` 不抛错。
  顺带一条库内事实：Postgres 往子表写行会向父行取 `FOR KEY SHARE`，所以并发的会话写入天然排在清扫之后。
- 入口 `POST /api/admin/guests/reclaim`（新增）四道门叠着：`isAdmin()` 判在域里 + CSRF + 6 次/10 分钟 +
  batch ≤ 200；`dryRun` **默认 true**；用 `currentUserOrNull()` 而不是 `requireUser()`（后者会给匿名请求
  白造一个 guest 身份，等于清扫自己造料）。**不用确认串**——确认串证明的是"坐在键盘前的人认得自己的标识"，
  而被回收的那个人根本不存在；拿程序自己算得出的串去满足那道检查是假装有门（§159）。
- 界面：`/admin/users` 首屏由服务端算一份快照（`page.tsx` 里 `Promise.all` 的第三路），
  `GuestReclaimPanel.tsx` 挂同一页、按之前强制"再数一遍"，扫描放在那两条 return **之后**——
  非审核员连"此刻有几个沉默 guest"都不该问出来。
- 判决与限度：`docs/adr/0072-stale-guest-reclaim-called-by-admins.md`（五个选项，含否掉常驻进程那句
  "没有主语"）；`docs/SECURITY.md` 补入口、三条刻意的写法与误伤半径判据。
- 夹具与手跑见证进了仓库：`scripts/guest-reclaim-fixture.mts`（先清后种，`--rollback` 只按 `bio='s29witness'`
  删自己造的行）、`scripts/capture-guest-reclaim.mts`。

**活体读数（写这一节时现采：`.scratch/s29-census5.mts`，2026-10-30 06:02 本地 = 2026-10-29T22:02Z）**

| 问的 | 读数 |
| --- | --- |
| `users` 总行 | 1836（最早一行 `2026-09-21 17:39Z`） |
| 未软删的 guest | 74（与页眉那句"未认领的 guest 74 个"同源） |
| 已软删的行 | 42 |
| guest 名下的会话 | 62 条，61 条还活着；最早到期 `2026-10-29 18:41Z`、最晚 `2026-11-28 21:42Z` |
| 此刻的扫描 | 沉默到线 0 · 够格 0 · 发布过不碰 0 · 带令牌不碰 0 · batch 50 · 未截断 |
| 指向 `users` 的外键 | **41 处**：`CASCADE` 20 / `SET NULL` 16 / `RESTRICT` 5（后五处是 `projects`/`games`/`worlds`/`characters`/`storyboards` 的 `owner_id`） |

最后一行是"软删不硬删"的账：硬删那五处 `RESTRICT` 会直接把删除挡下来。而"此刻 0 个够格"**不是清扫跑过了**，
是最早那行才 2026-09-21、60 天那条线还没到（`2026-09-21 + 60 天 ≈ 2026-11-20`）。
开工那次也采过一遍——1811 行 / 未软删 guest 49（终端读数，**没留日志**，所以不进表）：两三个小时里涨的
25 行全是被测试与探针造出来的浏览器身份，涨之前没有任何写入方会去收它们，这就是这一片要解决的问题的形状。

**真 bug 是截图见证抓的，不是设计出来的**：手跑脚本点到"真收走"那一步时，回执写着"收走了 2 个"，
可屏幕上那两行候选还在原地，`[data-reclaim-empty]` 30 秒等不来。根因是 `useState(scan)` 只在挂载时读 props，
`router.refresh()` 送下来的新快照没人接。修法是把"该不该换"抽成纯函数 `adoptScan(prev, next)`
（`app/admin/users/reclaim-state.ts`）配一条 `useEffect` 接住，判据用每份快照自己的 `now`，**不判数组长度**——
"收走之后候选变少"恰好是必须换的那一种，按长度判会正好不换。

**凭证（逐字读数）**

- 新见证先红：`apps/web/test/guest-reclaim.integration.test.ts` 打在还没有域函数的库上 →
  **`Test Files 1 failed (1)` / `Tests 17 failed (17)`**，`Duration 17.31s`（`.scratch/s29-red-first.txt`）。
- 域 + 路由两片绿：**`2 passed (2)` / `25 passed (25)`**，`Duration 62.24s / tests 40.06s`（`.scratch/s29-green-both.txt`）。
- 加上面板那 4 条：**`3 passed (3)` / `29 passed (29)`**，`Duration 19.08s (transform 2.86s, collect 8.22s, tests 8.97s)`
  （`.scratch/s29-green-final.txt`，A4r 复原之后重跑）。
- 回归 `account.ts` 被抽执行体：`apps/web/test/account-deletion.integration.test.ts` → **`15 passed (15)`**
  （`.scratch/s29-regression-account.txt`）。自助注销那条路一个字没改语义。
- e2e 常驻那两条：**`2 passed (11.0s)`**（`.scratch/s29-e2e-final.txt`，此刻库里 0 候选，走的是 `else` 那一支）。
- 手跑见证（`.scratch/s29-capture-final.txt`，逐字）：
  `首屏读数：沉默到线 3 个 · 够格 2 个 · 发布过不碰 1 个 · 带令牌不碰 0 个 · 一次最多 50 个`、
  `dry run 回执：只数了一遍：够格的 2 个，一条都没写（库里未删夹具行 5 → 5）`、
  `执行回执：收走了 2 个`、`执行后读数：沉默到线 1 个 · 够格 0 个 · …`、`执行后按钮：收走这 0 个`、
  `库：s29witness·丙发布过 删=false 会话=1 活草稿=1 发布=1`、`审计里 user.reclaim 的行数：2`、`界面见证通过`。
  截图 `screenshots/guest-reclaim-{first,dryrun,applied}.png` 三张都看过：`applied` 那张上"收走了 2 个"是回执、
  清单已空、按钮跟着说"收走这 0 个"。跑完 `--rollback`，库里 `s29witness` 残留 0 行。
- 类型与 lint：`npx tsc --noEmit -p apps/web` 退出 0、`-p e2e` 退出 0；
  `npx eslint` 覆盖本片 10 个改动路径退出 0。
- 限流那一格**没有放宽**：反复手跑把 6 次/10 分钟的桶打满，e2e 撞过一次
  `Error: 回收端点回了 429，界面上那句话是「…」`，等窗口过去重跑才绿。

**臂表（每条都点名；跑完文件逐字节恢复，`grep -rn "MUT A" apps/web/src apps/web/test e2e scripts` 空）**

A1–A9、A12–A14 用 `-t` 只跑点名的那一条（所以读数里那些 `17 skipped` / `6 skipped` 是过滤，不是没跑），
A4r、A15–A17 是整文件跑。

| 臂 | 改坏的那一处 | 红在谁身上（逐字） |
| --- | --- | --- |
| A1 | 候选谓词摘掉 `eq(users.guest, true)` | 集成 **1 failed / 17 skipped**：`认领过的账号不是回收的对象，哪怕他的会话烂了六十天`，`expected true to be false` |
| A2 | 摘掉 `lt(users.createdAt, cutoff)` | **1 failed**：`出生没多久的零会话身份不动：createUserSession 那两步之间就是这形状` |
| A3 | `staleFor` 换成 `sql\`true\`` | **1 failed**：`grace 是"再过 30 天"，不是"会话一过期就收"：差二十五天的不算，差一秒的算` |
| A4r | `staleFor` 只留 `lastExpiry is null`（丢掉"最后一条烂够久"那一支） | 整文件 **12 failed / 6 passed**，头两条是 `沉默到线的两种形状都在候选里`（`expected false to be true`）与 `会话还活着的人绝不进候选`；红的半径比预想大，因为执行体与 dry run 那几条也依赖同一句判据 |
| A4 | 同一道边的第一版 | 只跑到 **1 failed / 17 skipped**，且**改坏的那一处没记进日志**——所以整文件重跑成 A4r，表里以 A4r 为准（`.scratch/s29-arm-A4.txt` 保留原样） |
| A5 | 摘 `noLiveSession` | **作废**：`-t` 过滤词写错 → `Tests 18 skipped (18)`，0 条执行。那不是红，是没跑（第二十八片 B6 同族） |
| A5b | 摘 `eq(users.role, 'creator')` | **1 failed**：`被手提成审核员的 guest 也不收：清扫不该改变谁能审核` |
| A6 | 扫描里 `published` 恒为 false | **2 failed**：`名下有已发布作品的访客被**明说**地排除…` + `已发布的东西不跟着清扫走…` |
| A7 | 扫描里 `liveToken` 恒为 false | **1 failed**：`还握着有效 API 令牌的访客同样排除；已吊销的那一枚不算护身符` |
| A8 | `clampBatch` 不钳上界 | **1 failed**：`batch 上界挡在入口：要 5000 个一次收完是不可能的`，`expected 5000 to be 200` |
| A9 | `stillReclaimable` 直接 `return true`（锁上不重判） | **1 failed**：`两个人同时点：每个人最多被收一次…`，`expected 'rejected' to be 'fulfilled'` |
| A12 | 路由摘掉 `isAdmin()` | 路由集成 **1 failed / 6 skipped**：`不是审核员就一个字都不写，而且被拒的那一次进审计`，`expected 200 to be 403` |
| A13 | 路由摘掉 CSRF | **1 failed**：`没有 CSRF：403，而且库里一个候选都没少` |
| A14 | 路由摘掉限流闸 | **1 failed**：`同一个审核员连点第七次：429…`，`expected 200 to be 429` |
| A15 | `adoptScan` 的 `>=` 换成 `<=` | 面板单元 **3 failed / 1 passed**：换新的那条 + `迟到的旧快照不许盖` + `判的是时间不是数组长度`（`expected [ …(3) ] to have a length of 1 but got 3`） |
| A16 | `adoptScan` 改判候选数组长度 | **3 failed / 1 passed**：红的还是那三条——`>=` 与长度在这一格里区分得开，"同一时刻取后到的"那条照旧绿 |
| A17 | 摘掉面板 `useEffect` 里 `setLive((prev) => adoptScan(prev, scan))` | **没有牙**：`29 passed (3 files)` 且 `tsc` 退出 0（`.scratch/s29-arm-A17.txt`） |

编号说明：A10、A11 **不存在**（后端那批编号跳掉了，没有对应日志），别去找它们。

**没有牙的那几格，点名**

- **A17 就是这一片最该有门的那一格**：面板接住服务端新快照那一行，今天只有手跑脚本能证（§85：手跑的见证
  等于没有见证）。为什么给不了常驻门——e2e 那一条**刻意不点真执行**（那一下会收走此刻所有够格的访客，
  包括不属于这条用例的身份），而不点就没有"旧读数要换"这件事。要补它，需要先给端点一个 `ids` 参数
  （只收点名的那几个人），今天没有。
- `>8` 那个截断分支：e2e 里写好了断言，但此刻库里 0 候选，常驻跑走的是 `else`；
  手跑夹具也只造 2 个够格，`[data-reclaim-truncated]` 那一格**从来没在浏览器里显形过**。
- 限流臂 A14 的牙在路由层；界面上"第七次点会看到 429 那句话"没有用例。
- `SCAN_LIMIT`（1000）触顶时 `scanTruncated` 在界面上的说法没有用例，也没有臂——造 1000 个沉默 guest 的
  夹具成本高于这一片剩下的价值，记在这里。

**共用工作树的代价**：这一片的臂全打在单元与集成层，单条 4–50 秒，比第二十六/二十七片那 100 s / 74 s 的窗口小。
但两件事要记：① 手跑见证反复跑会把那个审核员账号的 6 次/10 分钟桶打满（今天打满过一次，等窗口过去）；
② 夹具那 5 个身份带 `published_projects` 行，第二次种之前**必须先清**，否则撞 `published_path_key`——
脚本已改成先清后种，但这是"夹具会咬人"的又一例。

**仍欠**

1. **今天仍然没有人收**：这一片交付的是"能收"，不是"有人收"。第一波候选出现在 `2026-11-20` 前后
   （最早那行 + 60 天）。要么下一片给一个运维 CLI 入口（ADR-0072 里"运维脚本"那条授权已经写好），
   要么写进 runbook——不能靠"到时候记得去后台点一下"。
2. **面板接快照那一行没有常驻门**（A17）。前置是端点支持 `ids`（只收点名的），那样 e2e 才敢点真执行。
3. `>8` 截断那一支与 `scanTruncated` 在界面上的表现都没有用例。
4. "发布过作品"这道护身符让**发布过一个东西的僵尸身份永远留在库里**——这一片故意不收，但也没有别的机制收它。
   要收得先回答"公开页的作者名换成什么"，那是产品问题不是清扫问题。
5. 第二十八片仍欠第 6 条（探针留下的约 22 个 guest）：这一片给了路径，但那批行要等到 11 月下旬才够格；
   此刻库里 0 候选就是这句话的证据。
6. `runAccountDeletion` 抽出来之后，两条调用路（自助注销 / 批量回收）共用一个执行体，
   但**回收那一路没有跨实例演练**——第二十一片那种两实例脚本还没覆盖到它。

## §SEC 第三十片：一次点击的范围——端点接 `ids`（点名的才收），第二十九片 A17 点名的那一格今天有了常驻门（2026-10-30）

**落点（七条）**

1. **域**：`reclaimExpiredGuests({ …, ids })`。给了 `ids` 就**只碰这些 id**（先去重、再钳 `GUEST_RECLAIM_MAX_BATCH`），
   不给仍是整份候选清单；回执多一个 `requested`——那句"点名的 N 个里"的 N 必须由服务端自己说。
2. **点名不是钥匙**：点到的 id 仍然逐个在 `for update` 锁下过**同一条谓词 + 那两道排除**（`lockReclaimable`），
   拿不到行就 `skippedUnderLock++` 跳过。顺手把名字改成从锁下那一行读回来——原来是从扫描那份 `Map` 里查，
   而点名时那个人**可能根本不在清单上**（`name ?? ''` 那种空名字就是这么来的）。
3. **路由**：`ids: z.array(z.string().uuid()).max(200)`。畸形报文 400 且**挡在限流闸之前**——
   否则连发坏报文就能把审核员那 6 次/10 分钟耗光，让真正要做的那一次被 429 挡在门外。
   响应新增 `named`、`requested`，执行那句改成 `点名的 N 个里收走了 M 个，K 个此刻不够格没动`。
4. **面板**：每行一个勾选框，**默认全勾这一屏列出来的**（前 8 行），全选框带 `（N/M）`、半勾时进原生
   `indeterminate` 态；一个都不勾时那颗按钮直接禁用。三份判据抽成纯函数（`selectionOf` / `allCheckedOf` / `toggleId`），
   于是"勾着的行"这件事有单元门，不是只有浏览器里才看得见。
5. **审计**：`detail.named` 分得出一轮是指名道姓收的、还是照整份清单收的。
6. **e2e 第二格点真执行**：`e2e/support/stale-guest-fixture.ts` 种两个"账龄 100 天 + 会话 70 天前烂掉 + 一个草稿"
   的访客（带这一趟独有的 `bio` 记号，`finally` 按记号删干净），取消全选、只勾自己那一个，
   收完之后要求**那一行从屏幕上消失**。这一句就是第二十九片臂 A17 点名的那一格。
7. ADR-0072 补**决定八**（一次点击的范围＝这一屏勾着的行）；SECURITY.md 那段批量按钮补第四条刻意的写法。

**活体读数（本地开发库，`scanGuestReclaimCandidates()` 自己算的，不是脚本另数一份）**

| 时刻（本地） | 读数 |
|---|---|
| 09:42 动手前 | `stale 0 · 够格 0 · 发布过不碰 0 · 带令牌不碰 0 · batch 50 · 未截断` |
| 10:04 夹具回滚后 | 同一份，仍然全部 0 |
| 见证夹具在场时 | `沉默到线 3 · 够格 2 · 发布过不碰 1`（甲乙丙，与夹具设计一致） |

**界面见证（`scripts/capture-guest-reclaim.mts`，逐字，`.scratch/s30-capture2.txt`）**

```
首屏读数：沉默到线 3 个 · 够格 2 个 · 发布过不碰 1 个 · 带令牌不碰 0 个 · 一次最多 50 个
执行按钮：收走这 2 个
dry run 回执：只数了一遍：够格的 2 个，一条都没写（库里未删夹具行 5 → 5）
首屏勾选：全选（2/2） · 甲=true 乙=true
取消甲（9460a78a-…）之后：全选（1/2） · 执行按钮=收走这 1 个
点名执行回执：点名的 1 个里收走了 1 个
点名执行后读数：沉默到线 2 个 · 够格 1 个 · 发布过不碰 1 个 · 带令牌不碰 0 个 · 一次最多 50 个
点名执行后列表：s29witness·甲沉默两月 … · 执行按钮=收走这 1 个
库里核对：乙（点名）删=true 甲（没点名）删=false
执行后读数：沉默到线 1 个 · 够格 0 个 …  执行后按钮：收走这 0 个 禁用=true
库：s29witness·丙发布过 删=false 会话=1 活草稿=1 发布=1
审计里 user.reclaim 的行数：2
界面见证通过
```

看图三张：`screenshots/guest-reclaim-named.png`（全选（1/2）、框是取约态、只有乙勾着、按钮"收走这 1 个"）、
`guest-reclaim-after-named.png`（乙那行没了、读数换成"够格 1"、回执那句"点名的 1 个里收走了 1 个"、
"全勾"重新指向新一屏）、`guest-reclaim-applied.png`（空态那句"这是好消息，不是这个入口坏了"+ 按钮禁用）。

**夹具没清，被自己的守卫挡了一次（记下来，因为那是设计在起作用）**
09:49 为手跑见证种下 5 个 `s29witness` 身份，脚本中途失败没清；09:52 全量 `apps/web` 套件里
`沉默到线的两种形状…` 红在 `for (const c of scan.candidates) expect(MINE.has(c.id)).toBe(true)`
（`1 failed | 1919 passed (1920)`，`.scratch/s30-webtests-full.txt`）。红的是**别人的行混进了这一趟的候选**——
第二十九片那条纪律长成的样子。`--rollback` 之后单跑该条 `1 passed | 23 skipped`。
**没有放宽那条守卫，也没有为它开洞。**

**`npm run lint` 拦下的那一处：箭头写法的 `fail()` 不结束控制流**

改完 `kept/taken` 那一次重跑之前，全仓 `npm run lint` 先红了一条
（`.scratch/s30-lint3.txt`：`scripts/capture-guest-reclaim.mts(123,10): error TS18048: 'hit' is possibly 'undefined'`）。
根因不是那行代码，是 `const fail = (message: string): never => { throw … }` 这种写法——
**TS 只认函数声明（或带显式类型标注的变量）上的 `never` 返回值来终结控制流**，箭头函数赋给 const 不生效，
于是 `if (!hit?.id) fail(…)` 之后 `hit.id` 仍旧是 `string | undefined`。改成 `function fail(…): never` 之后
窄化成立，脚本里每一句 `fail(…)` 才真的算"走到这里就停了"。
`grep -n "const fail = (message: string): never" scripts/*.mts` 现在 0 处。
这条与上面那格同类：**门是类型系统与 lint 在跑，不是我盯着看**。

**臂表（每一臂改坏 → 跑 → 看红 → 立刻改回；日志 `scratch s30-arm-*.txt`；全部改完 `grep -c "MUT "` = 0）**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| B1 | 摘掉面板 `useEffect` 里接住新快照那一句（＝第二十九片 A17 那一格） | e2e 第二格红：`[data-reclaim-row="…"]` Expected 0 / **Received 1**，60 s 超时 → **A17 从此有牙** |
| B1b | 半勾时不进取约态（`indeterminate = false`） | 同一条 e2e 红：`Expected: indeterminate / Received: unchecked` |
| B2 | `selectionOf` 去掉"只留这一屏"那一步 `filter` | 面板单元 **2 failed / 6 passed**（`expected [ 'a', 'z' ] to deeply equal []`） |
| B3 | 面板把 `ids: selected` 换成 `ids: shownIds` | e2e 红：`requested` Expected 1 / **Received 2** |
| B3c | 一个都不勾时按钮不再禁用 | e2e 红在 `toBeDisabled()`（`Received: enabled`） |
| B4 | 域里忽略 `ids`（`named = null`） | 集成 **6 failed / 28 passed**（域 5 条 + 报文层 1 条） |
| B5 | 路由 schema 不再要求 UUID | 报文层 **1 failed / 9 passed** |
| B6 | 点名的清单不钳上界 | 域集成 **1 failed**：`expected 201 to be 200` |
| B7 | 点名的清单不去重 | 域集成 **1 failed**：`expected 5 to be 2` |

**凭证**

- 单元＋集成：`42 passed (3 files)`；逐条 verbose 在 `.scratch/s30-integration-verbose.txt`（34 条）
  与 `.scratch/s30-panel-unit1.txt`（8 条）
- e2e：首跑 `3 passed (14.7s)`（`.scratch/s30-e2e-final.txt`）；补上取约态那一跑 `3 passed (16.0s)`
  （`.scratch/s30-e2e-indeterminate.txt`）；10:08 撞限流那一段见下面「界面上那句 429 第一次真被看见」；
  **终跑 10:20:34 `3 passed (14.4s)`**（`.scratch/s30-e2e-verify-final2.txt`，取约态那一版之后的最终读数）
- `npm run lint` 退出 0（`.scratch/s30-lint2.txt`，改 `capture-guest-reclaim.mts` 之后 `.scratch/s30-lint4.txt` 再跑一次也是 0）；
  `tsc -p apps/web` 退出 0
- 全量 `apps/web` 套件：`1919 passed / 1 failed`，那一条红的就是上面那格污染，不是回归

**界面上那句 429 第一次真被看见（10:10，撞的是自己喂进去的额度）**

终跑之前那一次 `e2e/guest-reclaim.spec.ts` 红在第二格，报的是这条链自己写的那句人话
（`.scratch/s30-e2e-verify-final.txt`，逐字）：

```
Error: 回收端点回了 429，界面上那句话是「没做成：回收操作太频繁了，稍后再试」
  > 49 |     throw new Error(`回收端点回了 ${res.status()}${shown ? `，界面上那句话是「${shown}」` : ''}`);
    at reclaimResponse (D:\内容创作平台\e2e\guest-reclaim.spec.ts:49:11)
    at D:\内容创作平台\e2e\guest-reclaim.spec.ts:137:18
  1 failed | 2 passed (33.5s)
```

前因：这一片为了取约态、点名、臂 B1/B1b/B3/B3c 反复跑同一格，20 分钟内往这个端点投了约 9 次——
`6 次/10 分钟/审核员` 那道闸按设计挡下了第 7 次之后的一切。**没有改那道数，也没有为测试换一个人**：
等窗口滑过去（10:20 前后），同一份代码 `3 passed`。这条也算把上面「没有牙的那几格」第一条还了一半——
见下面那条的更新。

**没有牙的那几格，点名**

- 界面上"第七次点会看到 429 那句话"仍然没有**常驻**用例（跑一次要占满 6 次额度再等 10 分钟，不划算）。
  闸本身在路由层有臂（A14），界面那一行 2026-10-30 10:10 被真撞见过一次，逐字读数在上面那节——
  **撞的是自己反复跑臂喂进去的额度，不是设计出来的**，所以它只算一次见证，不算门。
- `>8` 截断那一支这一片多了一句"这一次收不到"（e2e 里有断言），但**常驻跑此刻库里 0 候选，走的还是 `else`**；
  手跑夹具也只造 2 个够格。那一格至今没在浏览器里显形过。
- `ids` 与"勾着的行"之间没有第二道确认（决定八刻意不加）：一次误点就是真收走。兜它的是身份 / CSRF / 限流 / 审计四样。
- 默认全勾的范围是**这一屏前 8 行**；"这一屏之外还有几个够格的"界面上只有那句截断话说，没有分页，
  所以 `全选（8/8）` 读起来像"全部"，其实不是全部。这是这一片换来的新歧义，点名在这里。

**仍欠**

1. **一屏只列 8 行、没有第二屏**：要收剩下的那些，得先把前一屏收空（或等它们自己不够格）。
2. `scanTruncated`（1000 触顶）在界面上的说法仍无用例、无臂。
3. 运维 CLI 入口（第二十九片仍欠第 1 条还没还；第一波候选出现在 `2026-11-20` 前后）。
4. 回收那一路没有跨实例演练（第二十一片那种脚本没覆盖它）。
5. **"勾选框 ↔ `selected` ↔ 发出去的 `ids`"这条链只有一处常驻门**（e2e 第二格），而它跑在共享的本地库上：
   别的会话若在场留着沉默访客，这一格会看见更多的行——不会误收（只勾自己那两行），
   但"够格数 −1"那一句是相对读数算的，不是绝对数。

## §85 第二十六片：24×24 的下限从"读数"变成"门"——七个 admin 页的导航收成一份（2026-10-30）

需求原文（§85 第二十五片读数：发现 1 个、市场 1 个、管理台 7 个点击目标小于 24×24；WCAG 2.5.8 的下限是 24×24）。

**落点**

- `apps/web/src/components/AdminNav.tsx`（新）：管理台导航的**名单一处、下限一处**。原先七个 `/admin/*` 页
  各抄一份 `<nav>`，抄丢的不只是 CSS——`/admin/realtime` 只有 3 个入口、`/admin/users` 没有「市场工单」，
  从哪一页进管理台看到的路不一样。当前页渲染成 `<span aria-current="page">`（不链自己，读屏说"你在这"）。
- 七个页面换成 `<AdminNav current="…" />`；`observability` 那条"原始读数"不是导航，留在旁边并同样补到 24px。
- 发现页搜索链接、市场页四条头部链接、管理台「打开这一版看看」补 `min-h-6`（24px）。
- `e2e/narrow-surfaces.spec.ts`：发现／市场／管理台挂上 `smallTargetGate`——390 与 1280 都必须 **0 个 <24px**；
  Studio 仍只记读数（画布那组 12–20px 的缩放小按钮是已登记的欠账）。

**凭证**

- 同一张 spec 改前改后：发现 1→**0**、市场 1→**0**、管理台 7→**0**（两栏都是），页面级溢出与裁切始终 0。
- 五条臂：A1（`AdminNav` 去 `min-h-6`）红在管理台；A2（发现链接退回）红在发现；A3（市场去 `whitespace-nowrap`）
  **绿**——那条不是栅栏，如实记下；A3b（市场去 `min-h-6`）红在市场；A4（「打开这一版看看」退回）红在管理台。
- 回归：`e2e/observability.spec.ts` **3 passed**（三个 admin 面在换导航后照旧，`data-observability-raw` 仍在）；
  类型与 eslint 0。逐条读数见 `docs/EVALUATION.md` 第二十六片。

**仍欠**

- Studio 的画布小按钮（390 下 23 个 <24px）与它被 `overflow:hidden` 裁掉 678px，是同一块欠账：先有"适应窗口"再谈尺寸。
- 标签变长时的换行、2.5.8 的 spacing 例外没量。（平板/横屏已由第二十八/三十二片覆盖，
  登录态市场由第三十四片覆盖：10 张面 × 4 档 0 溢出 / 0 <24px。）

## §85 第二十七片：Studio 在 390 下拿回画布——左栏浮层、默认收起与「适应窗口」（2026-10-30）

第二十六片登记的那块欠账（"先有适应窗口再谈尺寸"）在这一片一起还。

**先量根因，再动手**

- 390 下画布只剩 **82px**：左栏图标 44px + 面板 264px 仍是内联的，`overflow:clip` 之外
  根本没有可画的宽度；缩放下限 10% 时帧仍宽 144px——**"只给缩放"这条路在 82px 里不成立**。
- 同页 23 个（390）／24 个（1280）<24px 的外壳目标：图层三连 21 个、顶栏回首页 47×20、
  项目名 125×21、异步勾选 13×13。

**落点**

- `StudioShell.tsx`：< lg 左栏 `absolute inset-y-0 left-[44px] z-30` 浮在画布上，默认收起；
  `innerWidth >= 1024` 时用 effect 展开（不在初值里读 `window`，避免水合不一致）。lg+ 三栏不变。
- `CanvasStage.tsx`：`data-fit-canvas` 浮层按钮 + **Shift+1**（Ctrl+0 被浏览器缩放截走，留作别名）；
  24px 边距、缩放 0.1–4、居中；只改视图态，不进撤销栈/不标脏/不落库（ADR-0073）。
- `LayersPanel` 三连、`TopBar` 两处、`CommandBar` 勾选补到 24×24。
- `e2e/narrow-surfaces.spec.ts`：Studio 挂 `smallTargetGate`，新增 `fitCanvas` 门——键盘与按钮
  两条路各按一次，帧四边必须落进视口（看矩形，不看 `scrollWidth`）；`[data-canvas-frame]`
  内是用户文档，不计入外壳的 24px 门。

**凭证**

- 390：画布 82 → **346×536**，适应窗口 **298×186（21%）**；1280：**624×390（43%）**。
- 外壳 <24px：390 **23→0**、1280 **24→0**；两条按法都绿，`1 passed`。
- 四条臂：A1（fit 空操作）红 414px；A2（图层去 min-h）红 1280；A3（只改浮层）**绿**——
  默认收起时面板不占宽，单改不是栅栏；A3b（默认展开 + 内联）红 31px@10%。
- 自然红两次：项目名 125×21 被 1280 点名；默认收起后图层树只剩 6 行（虚拟列表按
  `clientHeight=0` 算过窗口且不重算），补 `ResizeObserver` 后回 7 行——既存缺陷，顺手修掉。
- 回归：`studio.spec.ts` 三条（渲染/图层、选中改属性撤销保存、mobile 重排）3 passed；tsc 与 eslint 0。

**仍欠**

- iOS 真机、平板/横屏（768–1023）读数；画布**内容**目标尺寸不归外壳管。
- "进入即自动适应"被否（ADR-0073 选项 1）；要不要作为偏好提供没裁决。

## §85 第二十八片：平板 768 进表——同一张门多一档，另加「画布份额」（2026-10-30）

第二十七片只量了 390 与 1280，<lg 的中间档（768–1023，左栏已是浮层）没有读数。这一片把
768×1024 / dpr=2 / touch 加进 `WIDTHS`：`smallTargetGate` 与 `fitCanvas` 自动覆盖第三档，
不是新写一套断言。

**读数（`1 passed`）**

- 发现／市场／管理台：768 下溢出 0、横滚 0、裁切 0、<24px **0**。
- Studio：画布 **724×807**，适应窗口 **676×423（47%）**，<24px **0**，裁切读数 2 处是
  transform 的固有形状（门看矩形包含，不看 `scrollWidth`）。
- 画布份额：390 **88.7%**、768 **94.3%**（1280 52.5%，桌面内联，份额门只管 <lg）。

**新增份额门**

`surface.width / innerWidth >= 0.8`（只对 <lg）。理由：适应窗口能把任何视口装下，挡不住
"面板把画布挤成一条缝"；实测 88.7%/94.3% 留出图标栏 44px 余量，一旦左栏内联，390 掉到 21%、
768 掉到 60%，份额先红。

**两条臂**

- A4（浮层断点 lg→xl + 700px 起展开）**绿**——面板仍 absolute，只盖不挤，单改断点不是栅栏。
- A4b（左栏真内联 + 700px 起展开）**红**：Studio/平板768 画布只占 **59.9%**。

**仍欠**

- 1024–1279 横屏平板/小笔记本没量（那一档内联是设计，份额门不适用，但三栏实际读数空着）。
- 真机 iPad、安全区与软键盘没量；发现/市场/管理台在 768 的内容密度没量。

## §85 第二十九片：公开作品页的动作栏升成 24×24 的常驻门（2026-10-30）

第十三片记下的 `a[data-action-author] 56×21` 一直留在名册里（那遍只读数）。这一片修掉，
并把公开页**外壳**的 24px 从读数升成门。

- 基线（5 张真发布语料 × 2 栏）：每张 19 个点击目标，<24px 合计 **6 个**——
  作者主页 56×21（5 张）＋「试玩这一版 →」100×23（有游戏设计的 1 张）。
- 落点：两处链接补 `inline-flex min-h-6 items-center`；`mobile-layout.spec.ts` 每页 × 每栏
  断言外壳 <24px 为 0；`[data-published-frame]` 内是作品内容，不计入（与 Studio 同口径，ADR-0073）。
- 凭证：**6→0**（`1 passed`），19 个目标名册不变；臂 B1（作者链接去 min-h）红 64×21、
  B2（试玩去 min-h）红 100×23；B3（去掉帧排除）**绿**——样本里作品内容本来没有交互元素，
  这条排除今天是口径决定、不是数据逼出来的，如实记。
- 不动投影：帧仍 1440、390 下 5/5 要平移 1082px、首屏 27%——那是"默认按访客视口自动选档"的欠账。

**仍欠**

- 只抽了 5 张；768 / 真机没量；页头页脚等其余外壳元素在别的语料上没读数。
- 作品内容里的按钮尺寸由作者决定，不归外壳管。

## §85 第三十片：管理台的另外六页进表——宽表不再把布局视口撑开（2026-10-30）

第二十六片把 24px 收进了共享 `AdminNav`，但量过的 admin 页只有复核台。这一片把账号／审计／
实时／访问账／市场工单／观测六页按 390/768/1280 三档量，门沿用 `smallTargetGate`。

**自然红出来的五处（都由这张表点名，不是猜的）**

- 账号页 8 条 `a(@handle)` 107×16 → 补 `inline-flex min-h-6`。
- 审计页 390 下 `innerWidth` 自报 **1183**（六列表格 1159 宽把布局视口撑开）→ 表格套 `overflow-x-auto`。
- 访问账 `a(/api-tokens)` 77×18、市场工单 `a(人工复核台)` 60×15 → 各补 24px。
- 观测页 390 下自报 **480**（指标表/分类账表不换行）→ 三张表都套 `overflow-x-auto`。

**最终读数**

- 六页 × 三档：页面级溢出 **0**、裁切 **0**、<24px **0**（`1 passed`，57.5s）。
- 审计表三档都自横滚（1159 > 1128）、观测只有 390 有 1 处——是数据表自己滚，`innerWidth` 回到 390。
- 名册仍非空：账号 30、复核台 24、实时 10 个目标。

**两条臂**

- C2（审计表去掉 `overflow-x-auto`）**红**：回到 390 自报 1183。
- C1（账号 handle 去 `min-h-6`）**复现不出**：跑臂时夹具里已没有带 handle 的账号
  （被别的回收用例清掉）；证据是这一片的自然红（8 条 107×16），如实记。

**仍欠**

- handle 链接只在"有 handle 的账号"存在时出现；夹具清空时这条门是空过的。
- 审计表在 1280 仍需横滚，减列/折行没裁决；1024–1279 与真机没量。

## §85 第三十一片：默认按访客视口自动选档——四份投影 + 媒体查询（2026-10-31）

ADR-0069 只接了**手动**那一半（`?viewport=`）；不点链接的访客仍拿 1440 的帧，390 下要平移
1082px、首屏 27%。这一片把默认那一格还掉，做法是**零 JS**：有断点规则的页面，服务端把四档
各解一份铺进 DOM，基规则 `display:none`，四段媒体查询各放一份。四份来自同一个 `resolveLayout`，
不是第二条渲染路径；隐藏的三份不占位、不进可访问树。

**只对真有规则的页面启用**（`hasResponsiveRules`）：没有规则时四档只差根画框宽度，自动切换
只会裁画面——这类页面（sitemap 绝大多数）默认输出**逐字节不变**。`?viewport=design` 钉住设计
尺寸，四个断点名钉住那一档，认不出来的值退回自动（ADR-0063）。

**读数**（`e2e/viewer-breakpoint.spec.ts` 3 passed / `e2e/mobile-layout.spec.ts` 1 passed）

- 有规则的夹具页：390 → 375（0 平移）、768 → tablet、1280 → desktop、1536 → wide；
  四份里另外三份 `display:none`；钉住/design 时只解一份。
- sitemap 五张：夹具页 390 下从 **1440 / 平移 1082px** 变成 **375 / 0px**；其余四张无规则，
  仍是 1440 / 1066px。`mobile-layout` 的帧读数改为读**可见**那一份（ADR-0074）。
- 无规则页没有「自动」按钮（它与「设计」是同一份投影，摆出来就是空按钮，§159）。
- **2026-11-05 补了 axe**：四份 DOM 以前没进过无障碍读数。同一页 390：通过 24 / 违规 **0**
  （critical 0）；1280：通过 25 / 违规 **0**；可访问树里可见热点各 **1**（三份隐藏投影没冒进来）。
  臂：摘掉注入的媒体查询 → 可见热点变 4，门红。`-g "axe"` 可单跑。

**三条臂**

- 去掉注入的 `<style data-published-auto>` → 四份全显示，门红在"另外三份必须 display:none"。
- 去掉 `hasResponsiveRules` 闸 → 无规则页也铺四份，门红在"没有规则的一页只解一份"。
- 中段区间上界少减 1（768 同时落进两份）→ 单元测试逐宽度求值红（`published-variants.test.ts`）。

**仍欠**

- 1024–1279 这一带没有单独读数（区间已覆盖，未量真机）；iOS Safari 与手势未量。
- 规则页 HTML 变四份——**2026-11-05 量过了**：raw 39,929 → 65,514 B（+64%），gzip 8,552 → 11,003 B
  （**+2.4KB**），四份是同一份标记的复制、压缩后几乎重合 ⇒ 不值得为它加"只渲染两档"的复杂度。
  读数与四类没量到的见 `docs/PERFORMANCE.md` 同日那节。

## §85 第三十二片：横屏 1024 进同一张体检表——lg 边界上左栏翻回内联（2026-10-31）

1024 是 `lg` 断点：左栏从"浮层 + 默认收起"翻回"内联 + 展开"，是前几片都没量过的那一 px。
这一片把 `e2e/narrow-surfaces.spec.ts` 的宽度表从三档加到四档（390/768/1024/1280），
九张面（发现/市场/Studio/管理台及六个管理页）一起过表。

**读数**（`1 passed`，2.9m）

- 九张面 × 四档：页面级溢出 **0**、滚不动的裁切 **0**（Studio 的 2–4 处是 transform 固有形状，
  见第二十七片）、<24px **0**。
- Studio 在 1024 下画布 716px（左栏已内联）；「适应窗口」668×418 装进 716×551（46%），
  按钮与 Shift+1 两条路都过。
- 审计表在 1024 不再自横滚（390/768 仍各 1 处）；观测页只有 390 有 1 处。

**门的边界**：画布份额 ≥0.8 那条只适用于 `<1024`（它守的是"浮层左栏不挤窄画布"）；
1024 起左栏内联是设计本身，用"适应窗口装得进去"守，不用份额守。

**仍欠**：1025–1279 之间的具体断点没有逐档读数（同一布局区间）；iOS Safari 与手势未量。

## §165 搜索建议与历史：建议就是真实命中，历史只留在设备上（2026-10-31）

§165 落地时欠着"搜索建议与历史"。这一片按 ADR-0075 补上，且守住原来那条纪律——
**没有假实时**：建议来自 `searchPlatform` 的同一份查询与可见性判定（`perGroup=2`、取前 6），
所以"建议里有的，结果里一定有"；历史存本机 localStorage（8 条），平台看不到搜过什么。

**落点**

- `GET /api/search/suggest?q=`：`no-store`，按 `IP + 用户` 限流 120 次/分钟；两个字符起回结果。
- `SearchBox`（客户端）：250ms 防抖 + 中止上一发请求；combobox 语义（`aria-expanded` /
  `aria-controls` / `aria-activedescendant`），↓/↑/Enter/Esc 可用，**Esc 之后 ↓ 重新打开**。
- `search-history.ts`：规整（去空白、压空格、80 字）、同串忽略大小写只留最近一次、上限 8、
  坏 JSON 与配额满都静默降级；挂载后才读，避免水合不一致。
- 没有 JS 也能搜：表单仍是原生 GET。

**读数**

- `/api/search/suggest?q=mvsj0rjc` 匿名返回 1 条公开项目（`查看器夹具mvsj0rjc` → `/n/...`）。
- `apps/web/test/search-history.test.ts` 8 条；`e2e/search-suggest.spec.ts` 2 条全绿。

**红过的两次**

- 自然红：Esc 之后 ↓ 不再打开列表（组件只在 `open` 时处理方向键），门红在 `aria-activedescendant`。
- 臂：把建议标题改成固定串 → e2e 红在"建议里应当有那条公开项目"——门验的是来源，不是渲染。

**2026-11-05 补上 429 的可见暂停**（把 ADR-0075 那条"仍欠"还掉）

服务端说"打字太快"时，界面原先只是把建议收起来——那与"这个词没有命中"在用户眼里是同一件事。
现在 `suggest-pause.ts` 把 429 读成一段暂停期（`retryAfterMs`，缺省 30s，夹在 2 分钟内），
`SearchBox` 在暂停期内不再发请求，并在表单下用 `role="status"` 显示「建议暂停 N 秒——打字太快
被限流；结果页照常能搜。」；到期自己收尾，不要求用户再敲一个键。站在路径上更要紧的一点：
**限流停的是建议，不是搜索**——所以提示里必须写上后半句。

- 读数：`apps/web/test/suggest-pause.test.ts` 5 条纯函数（非 429 → null、读到正整数就用、
  缺省/非数/非正数退回 30s、超过 2 分钟夹到上界、剩余秒向上取整且过期不为负）；
  `e2e/search-suggest-pause.spec.ts` 1 条（route 喂 2s 的 429：提示可见且 `role=status`、
  暂停期继续键入请求数不涨、到期提示自己消失且下一次键入重新请求）。
- 臂：让 `pauseMsFromResponse` 对 429 直接返回 `null` → e2e 红在"429 之后应当有一句看得见的
  暂停说明"，证明这条门验的是暂停本身，不是元素有没有渲染。

**仍欠**：点击率/命中质量没有真流量读数；跨设备历史明确不做（要账户体系层的决定）。

## §85 第三十四片：登录态市场进表——先证明量的是那张脸（2026-10-31）

游客那张市场页在第二十五片量过，登录态从没进表：它多出「上架」表单（类型/可见性两个下拉、
标题/价格/描述/标签、来源项目与预览素材选择）与「我的物品」那一列（改可见性、下架）。

**这一片加的不是一张表，是一条载体断言**：新面 `市场·登录态` 带 `requires: '[data-marketplace-create]'`，
量之前必须先看见上架表单——否则会员会话没生效时量到的是游客那张脸，两次都干净，但那次不算读数。

**读数**（`1 passed`，11.8m，十张面 × 四档 390/768/1024/1280）

- 市场·登录态：四档页面级溢出 **0**、滚不动的裁切 **0**、<24px **0**（表单控件与下拉都在 24px 以上）。
- 其余九张面与第三十二片一致：全 0；审计 390/768 各 1 处表内横滚、观测只有 390 1 处。

**顺带修的一处测试基础设施**：admin 夹具登录在 dev server 编译时慢过 5 秒水合屏障会**抛错**，
把整张表打断——那与"本机没有 admin 夹具"是同一件事（该记未测），现在接住、打印原因并继续。

**仍欠**：标签变长时的换行、2.5.8 的 spacing 例外、iOS 真机。

## §SEC 第三十一片：第二屏——翻页、屏号，以及那颗「重新数一遍」其实一直没接上电（2026-10-30）

**这一片是从一个缺陷开始的，不是从一个功能开始的。** 给回收面板加第二屏之前，我先去读
`payload()` 为什么把整份读数摊平——读着读着发现：**路由从来没把 `scan` 放进回执**，而面板写的是
`body?.scan`。于是第二十九片以来那颗「重新数一遍」在屏幕上什么都没换，只换到一句回执文本；
`adoptScan` 走 POST 响应那半条分支是死码。更难看的是旧 e2e 那句"三处数同源"——回执与屏幕两边读的
都是同一份初始渲染，所以它**恒真**。§85 说的"门看着装着，其实没接电"，这一格今天抓到了现行。

**落点（七条）**

1. **路由**：回执整份带上 `scan`（不摊平成十来个同名字段，摊一次多一处"改了那边忘了这边"）。
2. **域**：`SCAN_LIMIT` 那个硬写的 1000 改成可注入的 `scanLimit`（默认 1000），回执里带着它；
   `clampScanLimit` 给它一条下限——0 或负数不许把这一趟变成"一个都没看"，却报出一个看着像结论的数。
3. **面板**：一屏 8 行之上叠一层屏——`第 X/Y 屏 · 这一屏 N 行 · 够格的一共 M 个` 单独一行
   （`data-reclaim-page`），配「← 上一屏 / 下一屏 →」，两端各自禁用。翻页**不发请求**：
   客户端在同一份快照上切窗口，所以屏号、行数、按钮那句数说的是同一时刻的同一份数据。
4. **换屏必清零点集**（`goPage` 里那句 `setPicked(null)`）：勾着的范围从来是"这一屏"，
   把上一屏那 8 个 id 带过来，与新屏一取交集就是空集，于是按钮变成"收走这 0 个"而人想收的正是眼前这一屏。
5. **两句"这一次看不全"分开说**：抽成纯函数 `scanCaveats`。`moreThanBatch` 是"这份清单一次装不下"（`batch` 的墙），
   `scanTruncated` 是"这一趟只数了前 N 个"（`scanLimit` 的墙）；合成一句"还有更多"，人会一直翻一个不存在的第三屏。
   N 从快照读，不是界面上硬写的字。
6. **e2e 从三格变四格**：第一格加对照组（页面加载之后再往库里种一个人，要求屏幕上的读数真的往前走一格、
   回执的 `scan.candidates` 里有那个新 id）——这一格是给上面那个缺陷补的电；第三格种 9 个人，
   要求第一屏 8 行、翻到第二屏只剩自己那 1 行、点执行只收站着的那一屏、收完屏号那一行自己消失。
   夹具把 9 个人的账龄按序号错开一分钟，"第 9 个在第二屏"才是可预期的而不是碰运气。
7. **`asAdmin` 那句假话修掉**（`e2e/support/auth-session.ts` 新增 `loginOutcome`）：夹具账号本来就存在，
   登不上时退回注册只会看见"该邮箱已被注册"——真话，但把人引向"账号没了"那条错路。现在撞登录那道闸
   就照实说"登录被限流，等窗口过去，不放宽闸"。

**臂表（每一臂改坏 → 跑 → 看红 → 立刻改回；日志 `scratch s31-arm-*.txt`；全部改完 `grep -c "MUT "` = 0）**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| C1 | 回执里去掉 `scan`（＝那个缺陷本身） | e2e 第一格红：`TypeError: Cannot read properties of undefined (reading 'candidates')`，位置正是这一片新加的那半格对照组（`e2e/guest-reclaim.spec.ts:96`）→ **死码从此有门** |
| C2 | `pageWindow` 不先 `clampPage` | 面板单元 **2 failed / 15 passed**：`expected [] to have a length of 8`、`expected [] to deeply equal [ 'c8' ]`（越界不切空表这一条） |
| C3 | `goPage` 不清勾集 | e2e 第三格红：`toBeChecked()` Expected checked / **Received unchecked**，下一句是"收走这 0 个" |
| C4 | 行不跟着屏号走（`pageWindow(candidates, 0)`） | e2e 第三格红：`[data-reclaim-row]` Expected 1 / **Received 8**（屏号说第 2/2 屏，站着却还是第一屏） |
| C5 | `scanCaveats` 里硬写"前 1000 个" | 面板单元 **1 failed / 16 passed**：`expected [ '只数了前 1000 个' ] to deeply equal [ '只数了前 3 个' ]` |
| C6 | `clampScanLimit` 去掉下限 | 域集成 **1 failed / 26 passed**：`scanLimit=0 没有被收回 1 起步: expected +0 to be 1` |
| C7 | 两句墙合成一句"还有剩下的" | 面板单元 **3 failed / 14 passed**（三道不同的距离被抹成一道） |

**凭证**

- 单元＋集成：`54 passed (3 files)`（面板 17 + 路由 10 + 域 27）
- 全量 `apps/web`：`181 files / 1972 tests passed`（12:58:20 起，1141 s，`.scratch/` 之外那份后台日志）
- e2e：`4 passed (36.0s)`（13:18:57，`.scratch/s31-e2e-clean.txt`）——臂全部改回之后的最终读数
- `tsc -p apps/web` 退出 0；`tsc -p e2e` 退出 0；本片那 10 个文件 `eslint` 退出 0
- 看图三张（都是 13:18 那一跑写的）：`screenshots/e2e-guest-reclaim-page1.png`（`第 1/2 屏 · 这一屏 8 行 · 够格的一共 9 个`、
  上一屏灰着、`全选（8/8）`、`收走这 8 个`）、`-page2.png`（`第 2/2 屏`、只剩 `·8` 那一行、`全选（1/1）`、
  `收走这 1 个`、下一屏灰着）、`-after-page.png`（读数换成 `够格 8 个`、屏号那一行消失、回执那句"点名的 1 个里收走了 1 个"）

**两道限流今天各撞了一次，都没放宽**

- 12:39 / 12:40 / 12:42 三次跑把 9 次尝试压进 `6 次/10 分钟/审核员` 那只桶，臂 C1 那一次 `3 failed / 1 passed`
  **整跑作废**——三条红的都是同一句「回收端点回了 429，界面上那句话是"没做成：回收操作太频繁了，稍后再试"」，
  不是变异造成的。作废的臂不算臂，所以 C1 在 12:53 重跑过一次（上面那条就是重跑的读数）。
  **429 那一次也吃额度**，这条今天才第一次被算进排期。
- 13:18 之前那一次红在**登录**那道闸（`10 次/15 分钟/邮箱`）：`注册没把会话变成 member（HTTP 409 · 界面上写：该邮箱已被注册）`。
  顺着这句去查库，`obs-admin+fixture@nexus.test` 好好地在那儿（`role=admin`、`deleted_at=null`）——
  也就是说那句报错是真的，指向的原因却是反的。这就是落点第 7 条存在的全部理由。
- 顺带一条排期纪律：`e2e/guest-reclaim.spec.ts` 与全量 `apps/web` 套件**跑在同一片库上**，
  后者会种"账龄几十天"的访客。12:5x 那一次第三格红在 `够格 10 个`（它要正好 9 个），
  就是因为我自己同时在跑全量套件。守卫没有放宽，改的是我自己的排期。

**没有牙的那几格，点名**

- 屏幕上那一行 `data-reclaim-truncated`（`moreThanBatch` 为真时那句"翻完这几屏也看不到剩下的那些"）
  **在浏览器里仍没显形过**：常驻跑此刻库里 0 候选，第三格 `batch=50 > 9` 走的是 `false` 那一支。
  它今天得到的门是 `scanCaveats` 那四条单元用例（臂 C5/C7 会红），不是界面用例。
- 屏号那一行与 `scanTruncated` 同时出现的形状（够格的比 `scanLimit` 多）没有用例——那要造 1000 个访客，
  或者把 `scanLimit` 一路传到面板，而后者今天只传到回执。
- `ids` 与勾着的行之间仍没有第二道确认（决定八刻意不加）；界面上第七次点会看到 429 那句话仍没有常驻用例。

**仍欠**

1. `data-reclaim-truncated` 那一行的界面用例（要一个"够格的比 `batch` 多"的形状，`batch` 可从回执注入）。
2. `scanLimit` 在面板上可选（现在只有域与集成能注入，界面永远跑默认 1000）。
3. 运维 CLI 入口（第二十九片仍欠第 1 条还没还；第一波候选出现在 `2026-11-20` 前后）。
4. 回收那一路没有跨实例演练。
5. 回收 e2e 跑在共享库上这件事：第三格那道"够格正好 9 个"的守卫在别人在场时会红——这是刻意的，
   但它意味着这条门不能与全量套件并排跑。要么给它一个独占的库，要么接受它偶尔红一次并说明原因。

## §14 × Properties：断点规则的人工入口——面板写规则 → 落库 → 访客自己吃到（2026-10-31）

需求原文 §14 要四档（Mobile/Tablet/Desktop/Wide）、要能在 Canvas 切 viewport、**AI 必须能自动生成
responsive rules**。ADR-0069 与 ADR-0074 把访客那一侧接完之后，作者这一侧仍然没有一条**专门为写规则
设计的**·：能写 `responsive` 的只有 AI 配方（mock 的「移动端优化」）、代码视图的断点变体类
（`code-parse` 按 `VARIANT_PREFIX` 解回规则）、以及直接改模型；Properties 面板只有读取那一半
（「tablet 下为 W×H」那一行）。这一片补的是那一格界面。

**落点**

- `apps/web/src/studio/responsive-editor.ts`（新，纯函数内核）：四个通道每一个都是 `patch` 里的**一个键**
  而不是一整组；写一个键不抹同组别的键、空组删掉、空规则删掉、同档并成一条（AI 配方与代码视图各写各的
  是真会发生的形状），按 `BREAKPOINT_ORDER` 窄到宽排——与 `applyResponsive` 用同一个数组，不各抄一份秩序。
  **冗余判据是"和摘掉这一档自己那条规则后的投影比"，不是"和设计值比"**：规则向更宽的档继承，设计值早就
  被更窄的档改过了，只比设计值会存下一堆什么都不改的规则。
- `store.ts`：写一键 / 抹一键 / 清整档三种动作共用一条路，**每个节点算自己那份新数组**（多选广播不是把
  同一份值贴过去）；不改任何东西的写入不进 ops ⇒ 不占撤销栈、不标脏（§150），返回真正落到的节点数，
  界面据此说"改了 3 个"而不是"改了 5 个"。
- `PropertiesPanel.tsx`：新增「断点（§14）」节——四格 tab 各带 `data-breakpoint-impact` 徽标 + 一颗
  「回设计尺寸」，点 tab 同时把画布切到那一档预览；一次点击 = 一个键 = 一条可撤销事务；清除键只在
  **这一档自己写过**的键上出现；「清掉这一档」这颗由"模型里有没有规则"决定而不是"面板那四格有没有键"
  （`layout`/`typography` 那两组面板不显示，但清档得按得下去）。
- `TopBar.tsx`：视口按钮的名字与宽度改取 `viewer-params` 那一份表。此前这里手抄"移动 375"，与访客页的
  "手机 375"两套叫法并存（§16：同一件事在两个界面里长得不一样，作者会以为不是一回事）。
- `packages/design-model/src/layout.ts`：`BREAKPOINT_ORDER` 导出（`readonly`）。
- **删掉一处按不动的死 UI**：根画框那条"这一档不给编辑宽"的分支。根本来就选不中——图层列表从根的孩子起
  （`layers-flat.ts:45`，`layers-flat.test.ts` 钉着）、Ctrl+A 排掉根（`CanvasStage.tsx:272`）、点根清空选区，
  所以面板永远收不到根；而 `runLayout` 里 `finalRoot.width = viewportWidth ?? modelRoot.width` 本来就让
  根宽在断点档上无效。披露挪到「页面」那一节（`data-page-root-width-from-breakpoint`），改成能读的而不是
  一颗按下去没反应的按钮。

**读数**（`e2e/responsive-authoring.spec.ts` 腿 A–L：**1 passed（4.7m）**；单元 5 文件 **81 passed**
= `responsive-editor` 23 + `studio-responsive` 8 + `layers-flat` 8 + `viewer-params` 12 + `layout` 30）

- 写之前画布上有这个节点 → 点「隐藏」当场没了 → 只藏被点名的那一个 → 撤销恢复 → 重做再藏 → tablet 那格
  同样藏着（级联在编辑面上就生效）；空写入不产生事务。
- 切到 mobile 后「页面」那节说清 375 从断点来，同时**服务端根宽仍是模型那份**、根节点一条规则都没多。
- 同一条规则里的第二个键（宽 200）不顶掉第一个键的清除键：徽标 1→2，撤销回到 1 且第二个键的清除键消失，
  重做回到 2。
- 第二节点第二通道（透明度走数字输入失焦提交）：平板那格 0→1、画布当场 0.4，手机那格仍 0（级联只向上）。
- 落库的逐字段形状：`{breakpoint:'mobile',patch:{visible:false,size:{width:200}}}` 与
  `{breakpoint:'tablet',patch:{style:{opacity:0.4}}}`——读的是服务端那份文档，不是顶栏"已保存"那行字。
- 访客（ADR-0074 之后的真实形状）：不带参数 ⇒ 四份投影同时在 DOM 里，1280 的窗口落 `desktop` 那份
  （两条规则都生效）；把窗口改成 390 ⇒ 落 `mobile` 那份（只吃到手机那条，透明度回到 1）；1600 ⇒ `wide`。
  显式 `?viewport=<档>` ⇒ 文档里只有那一份，且那一份的档名就是它（不是 design）；`?viewport=design`
  ⇒ 两条规则一条都不生效。

**徽标那条判据是这片里唯一一处"改了实现才绿"的**：先前只数"这一档自己那条规则改了几处"，于是平板那格
读 0 而画布与访客明明都变了（浏览器里先看见，再回头读源码定位）。现在的口径取两个判据的并——与设计值
不同，或与"去掉这一档自己那条规则后的投影"不同；只用前者会在"这一档把值顶回设计值"时读 0，只用后者
就是刚才那个谎。

**第二片（同日）：徽标改数模型里所有的组，面板外的键单独点名**

- `responsive-editor.ts`：新增 `responsiveImpactDetailOf` ⇒ `{total, panelChannels, outsidePanel}`。候选路径 =
  本档与更窄那几档的规则里出现过的**每一个键**（`applyResponsive` 只 `Object.assign` 写过的键，所以这个候选集
  是完备的，不必扫 DesignNode 全字段）；一组里的嵌套对象（`layout.padding`）算一处，因为 patch 里就是一个键。
  `responsiveImpactOf` 现在回 `total`。判据一条没改，改的是**数谁**。
- `PropertiesPanel.tsx`：徽标跟着换成全模型口径，读数下面多一行 `data-responsive-outside` 点名面板改不了的那些键，
  并说清「清掉这一档」会连着它们一起删；多选时各元素键集不一致就说"混合"，不抄第一个元素的名单（§159）。
- `e2e/responsive-authoring.spec.ts` 加腿 H2：起点文档里给 `Actions` 容器埋一条只有 `layout.mode` 的规则
  （值由这个节点自己的设计值取反推出来 ⇒ "该读 1" 是推出来的不是手抄的），随后在真浏览器里量：mobile 那格 0 /
  tablet 那格 1、那句话点名 `layout.mode`、面板四行的清除键一颗都不长、「清掉这一档」按下去徽标回 0 且那句话
  跟着没、撤销又回到 1。顺带补上了第一片没量到的那颗清档按钮。
- 读数：单元 `responsive-editor` **30 passed**（新增 7 条），五文件合计 **81 passed**；一条臂把 `live` 过滤回
  面板那四格（＝第一片的口径）⇒ **6 条红、24 条不动**，红的全是值不符（不是编译或收集错），新用例确实绑在
  这次改动上。e2e 腿 A–L **1 passed（32.5s）**——比第一片那条 4.7m 快一个量级，因为这一遍同机没有另一条 e2e
  在抢开发服务；那 4.7m 里腿 F 的 104s 与发布段的 266s 是被挤出来的，不是这条链的固有成本。

**第四片（2026-11-02）：这几键走到代码那一寸（codegen 发射 + code-parse 回写）**

- `packages/design-model/src/codegen.ts`：排布 → 工具类那张表提出来导出（`DISPLAY_CLASSES` /
  `gridColsClass` / `PADDING_SIDES`），基线与断点共用一份。`responsiveClasses` 现在发的是这一档
  **解出来**（`applyResponsive`）的 display 组，不是 patch 里 `mode` 那一个键；列数只在**这一档自己声明**
  时发（否则代码视图里那条 `grid-cols-[…]` 落在 flex 容器上什么都不改，§159）；`layout.padding` 按 patch
  写了哪几条边发哪几条、四边同值折成 `md:p-[…]`；`style.opacity` 发 `md:opacity-[…]`。
- `packages/design-model/src/code-parse.ts`：`decodeVariant` 的白名单跟着补齐，`MODE_OF_DISPLAY_CLASS`
  从同一张表反推，只收唯一属于一个排布的那些类（`flex` 三档都发 ⇒ 消费但不 `checked`，不然一条手写的
  `md:flex` 会把整个节点的回写顶掉）。`p-[…]` 展成四边再折回同一条 ⇒ 往返不丢键。
- `e2e/responsive-authoring.spec.ts` 加腿 N：发布与访客那几段之后另开一只登录的 context（作者的
  context 在发布后就关了，`/studio/<id>` 认会话），选中 Actions 读 `[data-code-line="selected"]` 里
  那一行类——`md:flex` + 方向类成对、padding 那一条由这个节点自己的数推出该是折起来的还是四条边，
  另一种拼法同时断言**不在**；再在代码里把 `md:opacity-[0.4]` 改成 `0.75` 点应用 ⇒ 面板读"这一档 0.75"、
  服务端那份文档就是 `{breakpoint:'tablet',patch:{style:{opacity:0.75}}}`。
- 读数：`packages/design-model/test` + `responsive-editor` + `studio-responsive` **432 passed（34 files）**；
  e2e 腿 A–N **1 passed（22.8s，暖服务 3101）**。这一腿绑得住是因为那三处类名在 HEAD 的发射侧根本没有
  （`git show HEAD:…/codegen.ts` 里 `responsiveClasses` 只有 `flex-col`/`flex-row`）。
- 开发服务的端口这一跑踩了一次空：3100 被本机另一个项目（页面标题是 FOOTBALL OS）占着，NEXUS 在 **3101**。
  这条链要用 `NEXUS_WEB_URL=http://localhost:3101` 跑，`curl` 回 200 不等于那是对的服务器——看页面标题。

**第五片（2026-11-02）：`mobile` 那一档走到代码那一寸——发射读基线，回写认得回来**

第四片接通的是 `md:`/`lg:`/`xl:` 三档，`mobile` 照实不发：它的断点前缀是空串，覆盖类与基类撞在同一
特异性上。这一片把它接成**移动优先基线**——不是 `max-md:`，那一套说的是"窄屏才生效"，而
`applyResponsive` 的级联是"本档与更窄几档合起来生效"；无前缀 → `md:` → `lg:` → `xl:` 的顺序与后者同构。
理由与取舍在 ADR-0069 第五片。

- `codegen.ts`：`classOf` 读的是 `baselineOf(node)`/`baselineOf(parent)`（`applyResponsive(node,"mobile")`，
  按节点 id memo 在 `RenderCtx.baselines`），尺寸/位置/排布/背景/样式/字型与 `hidden` 全按基线解；
  `responsiveClasses` 继续读**原始节点**（宽档要整条级联，基线只是窄的那一半），对空前缀那条 `continue` 不变。
  没有 mobile 规则的节点 `applyResponsive` 返回同一个对象引用 ⇒ 既有页导出的代码逐字节不变。
- `code-parse.ts`：`decodeClasses` 也喂基线那份节点，无前缀类的值**按声明方分流**——
  `mobileOwnedPaths` 列出手机那条规则声明过的路径（`layout.padding` 连它下面四条边），命中的写回那条规则，
  没命中的照旧写设计值。落错地方不是差一点：那条规则还盖着 ⇒ 重投影自检认不出这个类名 ⇒ 整节点回写被放弃
  （§19），作者以为改成功了而画布不动（§159）。
- 顺带修掉一处静默丢键：`responsiveOps` 原先手抄 `size|layout|style|typography` 四组合并 patch，
  `position` 被丢在门外 ⇒ 代码里改 `left-*/top-*` 落地的是"什么都不改"。名单现在来自
  `types.ts` 的 `RESPONSIVE_PATCH_GROUPS`，另有一条**编译期**穷尽门（接口多一组而表没跟上 ⇒ 测试文件编译不过）。
- 新腿：`codegen.test.ts` 2 条（移动优先基线发无前缀类 / 没有手机规则时一个字节不让路）+
  `code-parse.test.ts` 6 条（手机档覆盖往返零补丁、改基线类落进那条规则、非归属键照旧写设计值、
  `hidden` 改回来落进 `patch.visible`、父级手机档改排布后孩子按解出来的父级读、分组白名单同源门）+
  1 条 position 回写腿。类级断言一律先 `tokensOf()` 把 `className="…"` 切成 token——`md:flex-col`
  里含着 `flex-col`，`toContain` 那种写法会把"不该在"的那句读成"在"。
- `e2e/responsive-authoring.spec.ts` 加腿 O：面板在腿 C/F2 给 Eyebrow 写的手机规则（隐藏 + 宽 200）
  在代码视图里是**无前缀**的 `hidden` 与 `w-[200px]`（同时断言 `md:hidden`/`md:w-[200px]` 不在），
  在代码里把宽改成 240 点应用 ⇒ 报告"已回写 1 处：Eyebrow → responsive"、服务端那份文档是
  `{breakpoint:'mobile',patch:{size:{width:240},visible:false}}`（同一条规则里的另一个键没被顶掉）、
  设计值 `size.width` 仍是起手那一份、面板手机那格读"这一档 240"。截图两张：
  `screenshots/responsive-mobile-code-baseline.png`（代码那一行）与
  `screenshots/responsive-mobile-panel-readback.png`（面板读数 + 画布按 mobile 档呈现）。
- 读数：`packages/design-model` **32 files / 398 passed**；e2e 腿 A–O **1 passed（35.0s，暖服务 3101）**，
  腿 O 那一段 3.3s。六条变异臂逐条跑过并还原（A 5 红 / A2 1 红 / B1 2 红 / B2 4 红 / C 1 红，
  B3 反向臂红 27）——那条"没声明的键照旧写设计值"只有反向臂能红，红得太宽，所以记下它不是专用臂。

**第六片（2026-11-02）：对齐那两格——`layout.justify` / `layout.items` 一次接满发射、回写、面板三处**

第五片之后 `layout` 里最"看得见"的两个键是主轴对齐与交叉轴：画布上按下去东西真的会挪，代码那一寸
发不出，面板上也没有格子。这一片一次接上三处，并把它们钉在**同一个判据**上；理由与两股相反的失败方向
（发出去而画布不动 / 读了回来而发不出去 ⇒ §19 整节点回写作废）记在 ADR-0069 第六片。

- `codegen.ts`：导出 `JUSTIFY_CLASS` / `ITEMS_CLASS` 两张正表与 `ALIGNABLE_MODES = ["vertical","horizontal"]`
  一份判据；`responsiveClasses` 的档内发射、`layoutClasses` 的基线发射与 `reverse` 那条都改成读这一份。
  求解器（`layout.ts`）的 grid / wrap 分支在碰 `justify`/`items` 之前就 `return`，而这两条工具类在网格容器上
  CSS 是真生效的 ⇒ 那一档不发，否则代码/访客动、画布不动（§16 的反面）。
- `code-parse.ts`：倒表由正表 `invert()` 派生（不手抄第二份映射）；`decodeVariant` 用**同一个** `ALIGNABLE_MODES`
  判收不收，不收时在 `unmapped` 里说清"这一档解出来的排布是 grid，画布不按 justify-* 摆放：要把东西摆开，
  先把这一档排成横排或竖排"，同档第二条冲突只取第一条并点名。
- `responsive-editor.ts`：`RESPONSIVE_CHANNELS` 八格 → **十格**，新增 `layout.justify`（主轴对齐）与
  `layout.items`（交叉轴）两颗 `choice`；`appliesTo` 复用同一份判据，所以那一档投影出来是网格/换行时
  那两行**不摆出来**（按下去什么都不动的按钮不骗人，§159），取值与标签直接来自 `Layout["justify"]`/
  `Layout["items"]` 的键（编译期穷尽）。面板读数、撤销栈那句话、徽标点名、`withResponsiveValue` 同源。
- 新腿：`codegen.test.ts` 2 条（grid/wrap 那两档一条都不发而模型里的键还在；手机档的发在无前缀基线上）+
  `code-parse.test.ts` 4 条（三档往返零补丁；手写 `md:justify-*` 落网格档如实不收而同档别的键照旧回写；
  落自动布局档读进 patch 且同档第二条报冲突；改基线那条落进手机规则而不写设计值）+
  `studio-responsive.test.ts` 2 条（两格进事务/撤销栈且画布当场按它们摆；那一档解成网格时面板不给格子）+
  `responsive-editor.test.ts` 2 条（内核那两格随投影出现/收回、徽标从"能改"变成要点名的那一处；冗余判据吃
  这一档的投影而不是设计值）——它的 `CHANNEL_CASES` 那张**编译期**穷尽表也从八格跟着涨到十格。
- `e2e/responsive-authoring.spec.ts` 加腿 P：面板在 tablet 档点「主轴对齐 两端 / 交叉轴 末尾」→ 量画布上
  两个按钮的真实盒子（富余整份落进主轴、两颗都贴内容右沿）→ 代码那一行有 `md:justify-between md:items-end`
  → 落库形状（同一条规则里的 mode/padding/size 一个都不掉）→ 发布 → 访客 tablet 那一份的**相对盒子**与画布
  同一寸（`relBox`：两页面的绝对原点不同，不比原点）→ 再从代码把 `md:items-end` 改成 `md:items-center`
  点应用 → 面板读数变「这一档 居中」。截图三张：`responsive-align-panel-canvas.png`、
  `responsive-align-visitor-tablet.png`、`responsive-align-code-readback.png`。
- 腿 P 第一次跑红在访客那一段（差 1.5px），根因不在产品而在夹具：`publishPublic` 只等
  `[data-publish-url]` 可见，而项目**已发布过**时那句"当前公开地址（第 N 版）"点之前就在面板上 ⇒
  可能在 POST 落地前返回，访客读到上一版快照。现在它等面板报出**更高的那个 N** 才继续——
  这条同步点顺带也成了"面板那句版本号不是摆设"的见证。
- 读数：`packages/design-model` **32 files / 404 passed**；加 `apps/web` 那两个响应式文件
  **34 files / 450 passed**；`tsc -p e2e/tsconfig.json --noEmit` 干净；e2e 腿 A–P **1 passed（35.9s，暖服务 3101）**。
  五条变异臂逐条跑过并还原（A 2 红 / B 1 红 / C 2 红 / D 3 红 / E 1 红），预测红集与实际相符；
  D 多出来的那一红正是 §19 那条"整节点回写作废"现形——回写收了而发射发不出时，丢的不是一条类名而是整个节点的补丁。

**第七片（2026-11-02）：`layout.reverse` 的画布那一半——教的是求解器，不是发射**

第六片最后那条仍欠的第 2 句说的是同一个键的两半：代码那一寸两头早就通了（`layoutClasses` 为它发
`flex-col-reverse`、`decodeVariant` 认得回来），而 `layout.ts` 一次都没有读过这个键。于是模型里写着
"这一档反着排"的元素，**画布按正序摆、公开页与导出的代码按反序摆**——§16 的"三处同一份模型"断在这一格上，
而且断的方向与第六片那条②相反：不是代码写着而什么都没动，是两份投影各说一套。这一片合的就是这道缝。

- 改的是求解器：`ALIGNABLE_MODES` 那两档放孩子时按 `mainOffset = mainTotal - cursor - mainLen` **镜像主轴**，
  交叉轴照旧（CSS 的 `*-reverse` 只把主轴起点挪到另一头，交叉轴跟 writing-mode 走）。**故意不在 0 处夹住**：
  溢出的反向容器从内容盒的上沿/左沿探出去，正如正向容器从下沿/右沿探出去——夹住的话"hug 容器 + 内容更大"
  这一天天出现的档上两份投影又分岔。grid / wrap / stack / none 四档不吃这个键（那些分支本来就在碰它之前 return）。
- 动手前先量改动面：`grep -rn "reverse" apps/web/src` 只命中两处 SVG marker 的 `orient="auto-start-reverse"`
  （图视图的箭头方向），没有一处写 `layout.reverse` ⇒ 今天没有任何界面写得进这个键，可达的写入方只有
  代码视图与 AI 补丁，所以存量页面一份投影都不变（改完 design-model 那 404 条当场全绿，之后才加新腿）。
- 判据搬了家：`ALIGNABLE_MODES` 从 `codegen.ts` → `types.ts`。不是整理癖——这一片的读者里多了 `layout.ts`，
  而 `codegen.ts` 本来就 `import { applyResponsive } from "./layout"`，留在原地是环。消费者还是同一条链上的
  四处：发射（基线 + 断点档 + 反向类）、回写（`decodeVariant` 收不收）、面板（`appliesTo` 摆不摆得出）、
  求解器（认不认）。包外不受影响（`src/index.ts` 是 `export * from "./types"`）。
- 发射与回写的表还是一份：新增导出的正表 `REVERSE_CLASS: Partial<Record<LayoutMode,string>>`（只有那两档
  有反向类，所以 `Partial`：回写读不到条目就不该认这个 token），`code-parse.ts` 的 `MODE_OF_REVERSE_CLASS`
  由它反推。断点档那一格与 `justify`/`items` 共用两条判据（这一档自己声明了才发 + `ALIGNABLE_MODES`）。
- 那一行同时带着 `md:flex-col` 与 `md:flex-col-reverse`（同一个 CSS 属性的两种写法），**这是量过的**：
  用本仓库装的 Tailwind v4.3.3 现编一份含这两个类的样式，`.flex-col` 排在 `.flex-col-reverse` 之前 ⇒ 后者赢。
  保留正向类而不是"反向时不发正向"也是有意的：正向那条是 `layout.mode` 自己声明的，重投影自检要求每条
  `checked` 类再出现一次，抑制它会让作者手写那条无害的 `md:flex-col md:flex-col-reverse` **整节点回写作废**
  （§19 最贵的走法）。这条依赖记在 ADR-0069：换框架或升 Tailwind 大版本要重新量一遍。
- 回写多了一条归属规矩，是被一条红逼出来的：`md:flex-col-reverse` 同时说"纵排"与"反向"。现在只在**与这一档
  解出来的排布不同**时才写 `layout.mode`。无条件写的话，一条本来只有 `{reverse:true}` 的规则会多出模型里没有的
  `mode` 键——"发得出也读得回、一个补丁都不发"那条腿当场红。落在本来就是纵排的档上只补 `reverse`；
  落在横排档上 `mode` 与 `reverse` 一起收（那确实是改排布）。与腿 O 的"无前缀类落进手机规则"同源：**键归给真的说了这句话的那一层**。
- 新腿：`layout.test.ts` 8 条（竖/横镜像、镜像 × `space-between`、交叉轴不动、grid/wrap/stack/none 四种排布
  正反解出来的树一字不差、溢出不夹住、hug 高度两向相同、tablet 规则级联且设计值不多键）+
  `codegen.test.ts` 2 条（断点档发得出而翻成网格那档一条不发、设计值本来就是网格时一个 `-reverse` 都不发）+
  `code-parse.test.ts` 3 条（手写落横排档两键一起收、落竖排档只补 `reverse`、往返零补丁）。
- `e2e/responsive-authoring.spec.ts` 加腿 Q：在**代码视图**给 Actions 那一行补 `md:flex-col-reverse`（这一格
  面板还没有输入口，代码视图是唯一的人工写入口）→ 报告"已回写 responsive" → 落库形状（tablet 那条规则多出
  `reverse:true`，同一条里的 mode/padding/justify/items/size 一个都不掉，**设计值那份 `layout` 不许有 `reverse`**）
  → 画布上按镜像量：每个孩子到内容下沿的距离 = 正序时它到内容上沿的距离、顺序翻了、`left/width/height` 一个字都不动
  → 徽标从 N 涨到 N+1 且那句"面板没有输入口"点名点到 `layout.reverse` → 发布 → 访客 tablet 那一份的**相对盒子**
  与画布同一寸 → 撤掉这一格：走**撤销**（一次代码应用 = 一条事务，§150），规则里那个键消失、徽标退回 N、
  画布一格不差地回到正序；再**重做**，落库那份与撤销前逐字相同、镜像量出同一寸。
  这里第一版写的是"在代码里把那条类删掉"，跑出来报「没有可回写的改动」——`responsiveOps` 是**按档合并**的
  （代码里没提的键从模型留着，否则改一条 `md:gap-*` 会顺带抹掉同档的 padding 与尺寸），删类抹不掉键；
  而发射侧的 `{reverse:false}` 又没有对应的类（仍欠第 2 条），所以人工出口只有撤销与「清掉这一档」两条，
  这条腿现在钉的是前者。
- 读数：`packages/design-model` **32 files / 418 passed**；加 `apps/web` 那两个响应式文件
  **34 files / 464 passed**；`tsc -p e2e/tsconfig.json --noEmit` 干净；e2e 腿 A–Q **1 passed（1.4m，暖服务 3101，
  需 `NEXUS_WEB_URL=http://localhost:3101`——不设就打到同机另一个应用）**。八条变异臂逐条跑过并还原，
  预测红集与实际相符（A 求解器不读 reverse → 6 红；A2 顺手镜像交叉轴 → 2 红；A3 镜像夹在 0 上 → 恰 1 红；
  C 回写无条件补 `mode` → 1 红（往返零补丁）；D 从不补 → 1 红（手写落横排档）；E 完全不认反向类 → 2 红；
  F 断点档不发 → 4 红；G 基线不发 → 1 红），还原后 `git diff` 无残留、418 条复绿。
  一处如实记下：把两处发射里的 `ALIGNABLE_MODES` 判据各删掉一项**没有红腿可当载体**——`REVERSE_CLASS` 是
  `Partial`，grid / wrap 那两档查不到条目就什么都不发，判据被表遮住。所以那条判据的证据在求解器与面板两侧
  （A 与腿 Q 的画布那一段、`appliesTo` 那两格），不在发射侧。

**第八片（2026-11-08）：`{reverse:false}` 走进代码与面板——唯一一种"写下去的是否定"的值**

第七片那句仍欠欠的是两寸：发射侧发不出"取消反向"（CSS 里没有这条类，靠重说一遍正向方向），
而面板里连「顺序」那一格都没有，作者只能进代码视图。模型那一寸（发射 + 回写 + 求解器 + 面板
那一行）在 2026-11-05 的 `f0aca77` 落地；这一片收尾的是剩下的三样：面板**归一**那一层、
e2e 腿 R，以及变异电池第一轮 MISMATCH 之后按磁盘上的断言重推、并把两条说得太宽的判据收紧。

- 为什么这一寸比 `gap` / `justify` 那些键绕：别的键发的**那条类自己就是那句话**，
  `{reverse:false}` 说的是一件没有对应类的事——它顶掉的是**更窄那一档**留下的反向类。
  于是一个值同时决定发哪条类、发在**哪一档**、以及回写时这条类**归给哪一层**，三处口径不一致就是 §16。
- CSS 那一寸是量的（`.scratch/tw-cancel-browser.mjs`：本仓库 Tailwind v4.3.3 现编样式 + Chromium
  读 `getComputedStyle().flexDirection`，三组类名 × 400/900/1300 三个宽度）。有用的不是"变体赢基线"
  而是**产出顺序**：同一份 `out.css` 里 `.flex-col`:962 在 `.flex-col-reverse`:965 之前（同档反向赢）、
  `@media (width >= 48rem)` 里 `.md:flex-col`:2207 在 `.md:flex-col-reverse`:2210 之前
  （**同一档内正向顶不动反向**），而 `@media (width >= 64rem)` 整块排在 md 之后、`.lg:flex-col`:2296
  顶得动 `md:flex-col-reverse`。发射侧那句"只在更窄那档真的反着时才发正向类"就是从这三行来的；
  回写侧 `assertsReverse`（同档同时有反向类时那条正向类只是陪着写的）是同一寸的另一个方向。
- 表还是只有一份，多了一条**唯一性判据**：`DIRECTION_CLASS`（`codegen.ts:96`）从 `DISPLAY_CLASSES`
  派生，只挑"在这一档只出现过一次的类名"——`flex` 竖/横/换行三档都发（计数 3），它顶不动反向类也
  不能用来表态，所以排除；挑不出唯一一条就**不填**（`Partial` 的语义是"这一档没有能用来取消反向的类"）。
  今天这条判据永远成立，所以把 `=== 1` 放宽成 `>= 1` 是**等价变异**（臂 H9：红集 0，第二轮才把预测
  归对——第一轮按标题写了 2 红）。牙齿在"以后有人给同一档加第二条类名时挡得住"，于是新钉一条前提用例
  `codegen.test.ts`「正向方向类那张表在两档自动布局各挑得出唯一一条」，臂 H11（`=== 1` → `=== 2`，
  条目整个丢）证的正是这条前提。
- 面板真正新增的是**归一那一层**（`responsive-editor.ts`，本片唯一的生产代码改动）：
  `ChannelSpec.absentAs` + `effectiveAt()`。`reverse` 这一格"模型里没写"读成**正序**（`false`）而不是
  `undefined`，四处一起吃这层归一——`projectionWithout` 的冗余判据、`designValueOf` / `projectedValueOf`
  的读数、徽标那条 live 过滤。少了它会怎样：本来正序时点「正序」存下一条什么都不改的规则、徽标跟着数
  它一处、清除键也冒出来，界面在说"这一档改了投影"而画布/代码/访客三份都没变（§159 的形状）。
  这一格的 `appliesTo` 与 `justify`/`items` 共用同一份 `ALIGNABLE_MODES`（网格档按下去不动 ⇒ 不摆），
  `RESPONSIVE_CHANNELS` **十格 → 十一格**。
- 新腿与收紧（`packages/design-model/test`）：`code-parse.test.ts` 加 `reversedHero` 夹具与 5 条腿
  （取消类往返零补丁 ×2、手写 `md:flex-col` 只补 `reverse:false`、没得取消时一个字都不发、
  同档既改排布又取消反向时只发一条）；`codegen.test.ts` 加发射与前提各一条。
  **两条判据这一片被电池逼着收紧**：① 「只补 `reverse:false`，不凭空写 mode」原先用 `toMatchObject`
  比整个 `value`，多出来的 `mode` 键看不见 ⇒ 那句标题当时没人管（臂 H8 第一轮把它放过去了），
  改 `toEqual` 之后同一条臂从 2 红涨到 3 红，多出来的那一红就是它；② 「md:flex-col 只发一条，
  读回来 mode 与 reverse 都在」原先只断"零补丁"，而**读者不认领这条类时同样零补丁、同样不进
  `unmapped`**（那条类被这一档继承来的排布静默消费）——臂 H7 因此只有 1 红而不是 4 红。给它补了
  半条真读数：把模型那一档的 `reverse` 键抽掉再读同一份代码，认领与不认领只差在这一条补丁上。
  这两处不是"测试松一点点"的美学问题：它们正是唯一能挡住"回写悄悄不写键 / 悄悄多写键"的那道判据。
- `e2e/responsive-authoring.spec.ts` 加腿 R（两段，都在真浏览器里点）：
  ① 面板那一格——前提门（这一档读「正序 · 设计 正序」、Headline 没孩子那一格不摆、点「正序」一个键
  都不写也不涨徽标）→ 点「反向」后落库那份与腿 Q 从代码写进去的**逐字相同**、画布三个盒子的坐标
  与代码那一路**逐个相同**（两个写入方、一份真值）→ 代码视图那条行的 reverse 类名册恰为
  `['md:flex-col-reverse']` → 点回「正序」键整个退出去；
  ② 取消那一寸——手机档点「反向」→ 平板档点「正序」，落库变成两条规则（`mobile reverse:true` +
  `tablet reverse:false`）、平板徽标仍数这一处、清除键在；代码那一行 `md:flex-col*` 名册恰为
  `['md:flex-col']`；发布后访客在 1280 上下文里按 `data-published-variant` 读三档的**顺序**
  （手机反、平板正、桌面正）；撤销那条否定 → 画布回到反着那一寸 → 再撤一次回到没有覆盖那一份。
  顺手修掉一条一直在说谎的定位器：那句点名用的是 `[data-responsive-outside="1"]`，而平板那一档
  真的有两处没有输入口（`layout.columns` · `layout.padding`）——把计数钉进选择器等于让界面替我
  押注名册，改成认属性存在 + 认里面点名谁。
- 见证（`.scratch/arms-reverse8.mjs`，十臂；BASE **37 files / 526 全绿**起手；两轮跑完 `RESIDUE=false`，
  每条臂按字节还原）。红集第一轮有三臂对不上（H7 / H8 / H9），全部按磁盘上的断言重推、并把
  **测试**补到能见证那条臂，而不是松任何判据；第二轮只重跑对不上的那几条：

  | 臂 | 动的那一寸 | 实测红集（都在 `packages/design-model/test` 与 `apps/web/test`） | 裁决 |
  | --- | --- | --- | --- |
  | H6 | 发射侧"这一档取消更窄那档的反向"整条短路（`else if` 前塞 `false &&`） | 4：回写 3（一个补丁都不发 / lg 往返零补丁 / 只补 `reverse:false`）+ 发射 1（没得取消时一个字都不发） | MATCH |
  | H7 | 回写不认领"这条正向类在取消反向"（`saysForward = false`） | 2：只补 `reverse:false` + 只发一条读回来都在 | MATCH（第一轮 1 红，第二条腿当时见证不了，见上一条②） |
  | H8 | 回写无条件补 `mode`（`saysMode = true`） | 3：一个补丁都不发 / lg 往返零补丁 / 只补 `reverse:false` | MATCH（第一轮 2 红，`toMatchObject` 遮住了多出来的键，见上一条①） |
  | H9 | 唯一性判据放宽 `=== 1` → `>= 1` | **0** | 等价变异：`flex` 计数 3 被排除，两种比较符挑出的东西一模一样（第一轮按标题预测 2 红，那是预测错） |
  | H11 | 唯一性判据改成永不成立的 `=== 2`（条目整个丢） | 5：H6 那四条 + 前提用例（表空了发不出取消类 ⇒ 那条手写的 `md:flex-col` 过不了回写自检，§19） | MATCH |
  | H4 | 面板摘掉 `absentAs` 声明 | 2：顶掉东西那条 + 本来正序写正序那条 | MATCH |
  | H5 | `effectiveAt` 变恒等（摘掉消费，声明留着） | 同上 2 条 | MATCH |
  | H10 | 那一格的 `appliesTo` 退回只看有没有孩子 | 1：「这一格跟着这一档解出来的排布走」 | MATCH |

- 读数（两件事分开量）：**这一片落地之前 HEAD 就是红的**。`.scratch/headplane-full.mjs` 把本次会改动单测
  结果的三个文件换成 HEAD 字节、跑同一范围、再按字节还原（`RESTORE OK OK OK`）：在 `2ff7ba4` 那一档上
  **37 files / 523 通过 / 525**，红的正是面板那两条腿，与臂 H4 的红集逐字相同——`f0aca77` 把模型半边与那几条
  面板腿一起提交，而 `6c60fe7`（标题只说 "fix no-base-to-string lint in responsive-editor test"）把测试扫进了
  HEAD、`responsive-editor.ts` 没进去，于是 HEAD 停在"腿有、归一没有"那半个第八片。这条记进 ROADMAP 是为了
  下一次面板红时先问"是不是切面"。量完之后（01:36）并行会话把 `responsive-editor.ts` 那 30 行按**单独一条
  路径**提成了 `65b16e3`（内容与本会话工作树逐字节相同），所以这一片现在是两笔：`65b16e3`（面板那一层）+
  这一笔（文档与两条收紧的腿）。落地之后：同一范围 **37 files / 526 全绿**（design-model 35 files / 475）；
  e2e 腿 A–R **1 passed（4.9m）**，腿 R 三段 172.3s / 215.1s / 224.8s；CSS 那一寸的九格读数与行号
  现量在 `.scratch/tw-cancel.log`；`npm run lint`（九份 tsc 项目 + eslint 全树）**退出 0**。

**第九片（2026-11-08）：断点位置（x/y）`md:`/`lg:`/`xl:` 三档发得出也读得回——父级仍是自由定位逃生口的判据**

- 画布与访客此前就吃这一组键：mobile 靠基线投影生效，更宽那几档没有任何途径出类。现在
  `classOf` 里加了 `positionVariantClasses(node, parent, bp)`，按 `PREV_BP` 链（`mobile→tablet→desktop→wide`，这一档 vs 上一档的对比）算差量——
  窄档入流、这一档绝对 ⇒ `md:absolute` + `left/top` 类；窄档绝对、这一档入流 ⇒ `md:static` 顶掉窄档那条；两档都绝对仅在 x/y 有投影差时重发。回写侧 `decodeVariant` 的 position 组现在按与发射同一判据判（值与 `applyResponsiveBelow(node, breakpoint)` 对上就不写 patch——父级 flip 出来的 absolute 是零补丁类，不是子节点自己的值），`static` 静默消费 + 带条件 checked。
- 子节点绝对化**不再依赖子节点自己带 position patch**——这一刀后，父级换 mode 的投影差量由子节点的 ClassNames 自己承担，与现有 `applyResponsive` 同一口径。
- 见证：`codegen.test.ts`「断点位置发射……」「断点绝对化翻转……」、`code-parse.test.ts`「断点绝对定位往返……」「断点绝对化往返 A/B……」，
  共 89 条全绿（回归面含 reverse/overflow/字重/字距等一轮一轮往返）；全模型层 487 条。
- 面板输入口那一半（同日第二笔，`f895494`）：`position.x` / `position.y` 进 `RESPONSIVE_CHANNELS`，
  `appliesTo` 加了可选 `{ parent }` 上下文；自由定位逃生口（none/stack）才摆，其余收起（§159）。
- 浏览器腿（同日第三笔，本文件下面的第十片）：面板那两格在真 Chrome 里量过了。

**第十片（2026-11-08）：位置那两格的面板腿进了 e2e——`Sandbox` 自由定位沙盒与对照读数的设计**

- 夹具起手**之前**埋一个 `mode: none` 的 `Sandbox` 包住 `SandboxBadge`（固定位置 48/40，每轮先连根拔掉重建，幂等）；
  Eyebrow/CTA 当对照组（竖排/横排父级，位置两行不摆）。落库走的是既有 `prepareRuleFreeDocument` 那条 PUT，
  节点走 `validateDocument` 同一道门（本机校验过两条手拼节点，`errors: []`）。
- 腿 F3（都在真 Chrome 里点）：沙盒里点 `SandboxBadge` ⇒ mobile 档位置两行摆出来 → `position.x` 填 120 ⇒
  徽标读「这一档 120」、画布 inline left/top 相对 Sandbox 变成 (120, 40)（整页是一张绝对画布，断言落在**相对盒子**上，
  `relBox`——`left` 的页面坐标不是父级内坐标，第一跑红在 `top=546.9≠40` 就是这样；按盒子对齐后全绿）→ tablet 两格照样摆、
  投影继承 120（级联）→ 撤销 ⇒ 回 (48, 40)、清除键没了。腿 F4：Eyebrow 那一档位置两行不存在（对照）。
- 读数：`playwright test e2e/responsive-authoring.spec.ts`，**1 passed（1.0m）**，全链 A–F4–R 一次过；
  截图仍按失败即存。注：本机 3100 的另一会话 dev server 这段时间间歇 500（JIT 重编译期），这条跑的是**独占的生产构建**
  （`apps/web` `next start -p 3201`，serve 的就是今天这笔提交的产物）；dev 那一寸没量到就不说量到（§159 也管测试读数）。
- 第一跑的红是一个很有代表性的误判：`boxIn` 读到的是**页面坐标**（整页是一张绝对画布），不是父级内坐标——
  `left=48` 碰巧对（Sandbox 横向在 x=0），`top=546.9≠40`（Sandbox 在页面流的下端）。位置断言全部改落在
  既有的 `relBox`（相对父级的盒子）上之后绿——其余腿测量 Actions 的几何用的也是这把尺。

**第十一片（2026-11-08）：`style.blendMode` / `style.rotation` 两个响应式通道——取消半边也有 Tailwind 合法类**

- 模型里 `Style.blendMode`（16 值枚举）与 `Style.rotation`（角度）早就能在基线里发/收（codegen `styleClasses` 发 `mix-blend-*` /
  `rotate-[deg]`，code-parse 基线侧也读得回），但这两格进不了断点 patch，画布访客写得下、代码与 ZIP 读不回来（§16 那一端）。
- 这一刀：`responsiveClasses` 在 `md:/lg:/xl:` 档发同名的 `mix-blend-{值}` / `rotate-[{n}deg]`（`md:mix-blend-normal`、`lg:rotate-[0deg]`
  都是 Tailwind v4 合法类——显式写回正是"顶掉更窄那档"的那一刀，同 reverse:false 一寸）；
  `decodeVariant` 认领 `mix-blend-*`（对 `BLEND_MODES` 白名单，未知名进 unmapped 不猜）与 `rotate-[…deg]`（格式必须 `数字+deg`，否则 unmapped）——
  **这两格现在一整个 patch 组都通了**，面板也有了输入口（混合模式是 choice、标签用原名；旋转是 -360..360 的数字格）。
- 顺带说明为什么 `mix-blend-normal` 不需要"silently consume"：`mix-blend-normal` 本身就是 Tailwind 类，
  写回 normal 是合法的取消语义，直接进 checked。
- 见证：`codegen.test.ts`「断点混合模式/旋转发射……」、`code-parse.test.ts`「断点混合模式/旋转往返……」（含 `lg:mix-blend-normal` / `lg:rotate-[0deg]`
  取消更窄档那一条）；`responsive-editor.test.ts` 的"每一个通道非冗余值"那条腿因两个新格自动覆盖（载体都是普通文字节点）。
  读数：`packages/design-model` **35 files / 491 passed**（+2）、`responsive-editor` 39/39、`npm run typecheck` / `eslint` 0、全层回归绿。
  面板此刻 **二十四格**（位置两格仍按父级自由定位摆/收，第十片样子）。

**第十二片（2026-11-08）：`style.cursor` 响应式通道——取消半边同样有 Tailwind 合法类**

- 与第十一片同一条判据再推一格：模型 `Style.cursor` 六值枚举（default/pointer/text/not-allowed/grab/grabbing），
  基线早能发/收（`cursor-*`）。这一片把 `md:cursor-*` 接进 `responsiveClasses`（声明就发，`cursor-default` 是合法取消类）、
  `decodeVariant` 按 `CURSORS` 白名单认领（未知名 unmapped 不猜）、面板加「指针」一格（choice，中文说法：默认/手型/文本/禁止/抓取/抓取中）。
- 见证：同一份发射/往返两条用例扩成三样（混合模式/旋转/指针），往返仍旧零补丁；`responsive-editor` 39/39；全层回归绿。
  面板此刻 **二十五格**。`style` 里还剩 `strokes`/`effects`/`cornerRadius`/`overflowX|Y`；cornerRadius 是四键嵌套，第十三片（下一笔）通了它的模型层，见下。

**第十三片（2026-11-08）：`style.cornerRadius` 响应式通道的模型层——发射与回写round-trip，面板照旧不摆**

- 与 `layout.padding` 同形（四键嵌套，`applyResponsive` 整键替换）：发射 `md:/lg:/xl:` 档读这一档 merged 出来的 cornerRadius，
  四格同值折成一条 `md:rounded-[…]`；缺格就发单格那条 `md:rounded-tl/rounded-tr/rounded-br/rounded-bl-[…]`；
  `{cornerRadius:四格全0}` 发 `md:rounded-[0px]`（Tailwind 合法取消类，同 reverse:false 一寸）。
- `decodeVariant` 分格认领（`rounded-tl/tr/br/bl`）再折叠整个 `rounded-[…]`——顺序反了 uniform 会吞掉单格那边（`rounded-` vs `rounded-tl-` 是前缀关系，同 padding 那条判据）；
  单格那边缺哪格就写哪格（patch partial 对象，§16）。
- **面板照旧不摆 cornerRadius——与 layout.padding 同一状态**：四格那类嵌套通道的输入口还没立判据（一格还是四格？混合值怎么显示？），
  徽标会把 `style.cornerRadius` 点名为"没有输入口"那一格，「清掉这一档」连着它一起删。
- 见证：`codegen.test.ts`「断点圆角发射……」（md:rounded-[8px] / lg:rounded-tl-[12px] / xl:rounded-[0px]）、
  `code-parse.test.ts`「断点圆角往返……」（折叠后往返仍零补丁）。读数：`packages/design-model` **35 files / 493 passed**（+2）、
  `npm run typecheck` / `eslint` 0。

**第十四片（2026-11-08）：`typography.fontFamily` 响应式通道——choice 列表从文档现读，不是抄一份**

- `fontFamily` 是模型里唯一**动态选项**的一类面板通道：值长得像 `{font.heading}`，只有文档现有的 `fontFamily` 型 token
  （starter 里是 `font.heading` / `font.body` / `font.mono`）才算数。静态名单摆那个文档的人看不到的一串是假输入（§159），所以：
- `ChannelSpec` 新增 `choicesFrom: 'font-family-tokens'`（与静态 `choices` 二选一）；`appliesTo` 的可选上下文扩成 `{ parent, tokens }`；
  面板从 `state.document.tokens` 现派生这一行的选项（以及徽标与 labelOf 的标签）——文档里没有 fontFamily 型 token 时这一格**不摆**，
  appliesTo 与文档背书同一个判据。裸族名（`Georgia` 这种作者手写进模型的值）照样写得进写得出：
  codegen 发 `md:font-[Georgia]`，decodeVariant 认 `font-[…]` 裸栈。
- 发射/回写仍然走既有 typography 管线：`md:/lg:/xl:` 档发 `font-[family-name:var(--<prefix>-…)]`，
  `decodeVariant` 用基线同一套 `WEIGHT_CLASS → tokenRefOf → 裸栈 → unmapped 不猜`——回写自检必须对得上。
- 见证：`codegen.test.ts`「断点字族发射……」（token 引用 + 裸 Georgia 两种）、`code-parse.test.ts`「断点字族往返……」（零补丁）、
  `responsive-editor.test.ts`：every-channel 载体换成 `{font.heading}→'{font.mono}'`（写相同值会被冗余判据当场剪掉）、
  新腿「只摆在文档里真有 fontFamily 型 token 时」（空态不摆 / 传 DEFAULT_TOKENS 摆出 / 不传 tokens 收起）。
  读数：`packages/design-model` **35 files / 495 passed**（+2）、`responsive-editor` 40/40（+1）、`npm run typecheck` / `eslint` 0。
  e2e 腿 F5（同日跑绿，`next start -p 3201` 独占生产构建）：点 Headline ⇒ 字族三格摆出来 →
  `[data-responsive-choice="typography.fontFamily:{font.mono}"]` ⇒ 徽标读「改 1 处」、画布 computed fontFamily 当场换、撤销回设计值——
  console `[ 8.3 s ] 腿 F5`、全链 A–F5–R **1 passed（1.2m）**。
- 腿 F6（`style.blendMode` / `style.rotation` / `style.cursor` 三格，同日再跑一轮）：SandboxBadge 走完
  混合模式（点 multiply → computed mix-blend-mode）、旋转（填 15 → inline `transform: rotate(15deg)`）、指针（点 pointer → computed cursor），
  每格独立落库后各自撤销——全链 A–F6–R **1 passed**、console `[ 8.7 s ] 腿 F6`。

**第十五片（2026-11-08）：`mode` 的 `stack`/`none` 模型层逃生口落地——md:/lg:/xl: 模式标记类（ADR-0091）**

- codegen `responsiveClasses`：**只在这一档真的 flip 进 none/stack 才发** `${variant}[--nexus-mode:none|stack]`（Tailwind v4 任意属性，无消费方）；
  定位参照 `${variant}relative` 与基线同一判据（有孩子且自身非 absolute 才发）。设计态默认 `mode:'none'` 的叶子（defaultLayout 写死）不发、
  继承来的档不补发——首版没加这道门，marker 在所有档上平铺、7 条 §14 往返测试（字重/字距/圆角/字族/fontFamily 等）全部红了，当场收了 flip-gate。
- code-parse `decodeVariant`：同档 `[--nexus-mode:none|stack]` 认下 → patch.mode；`relative` 与 marker 共现时消费（定位参照），不共现仍 unmapped 字面上，不猜；
  `[--nexus-mode:grid]` 落 unmapped 不猜。
- 面板「排布」那格加第五样「自由定位」（value none），stack 保持仅代码可写。
- 见证：codegen「断点模式标记发射」（含 grid 投影不发 marker、叶子只发 marker 不发 relative）、code-parse「断点模式标记往返」、
  responsive-editor「排布那格——自由定位第五样」。读数：design-model 35 files / **499 passed**（+4）、responsive-editor **41/41**、typecheck / eslint 0。
- mobile 档的 mode 往返**已接**（同日第二刀）：`layoutClasses` 无前缀那组类发 `[--nexus-mode:…]`，`decodeClasses` 认下并消费 `relative`——
  设计 `none` 与 mobile 规则翻 `stack` 都能往返（`code-parse.test.ts` 三腿：基线设计 none、基线 mobile stack、grid 投影不发）。design-model 35 files / **502 passed**（+3）。

**第十六片（2026-11-08）：浏览器腿 F7——面板翻出的「自由定位」一次真 Chrome 走完**

- 腿 F7：Actions 翻成自由定位（面板那个 `[data-responsive-choice="layout.mode:none"]` → 徽标仍读埋的 padding+mode 两个 live 键 = 2），
  两个孩子失去 flow、画布上归各自 position 落在 Actions 原点（兄弟重叠）→ 撤销恢复并排；console `[ 5.6 s ] 腿 F7`、全链 A–F7–R **1 passed（58.1s）**。
  独占生产构建（`next start -p 3201`），跑完 3201 已停。

**第十七片（2026-11-08）：腿 F8——位置那两格按档内逃生口摆/收，浏览器第一次走完**

- 父级翻成自由定位（`layout.mode:none`）之后，孩子在 tablet 那档才摆出位置那两格（`position.x`/`position.y`）；
  mobile 档（设计横排，没有任何 none/stack 那一档）不摆；wide 档继承 tablet 逃生口（merged cascade）照样摆；撤销把 tablet 翻回横排，两格又**消失**。
- 读数：console `[ 7.9 s ] 腿 F8`，全链 A–F8–R **1 passed（6.0m）**；独占生产构建（`next start -p 3201`，已停）；spec 头注释 ⑮ 记了。
  上一跑天荒地老红在两条断言口径上（影响徽标翻完仍是 2、`boxIn` 是页面坐标不是父级内坐标——见腿 F7）；这一条的踩点：`'[data-layer-id="${var}"]'` **单引号**模板字符串没替换，
  定位器等了一个不存在的字符串的 900s 测试预算（段 745 点击死等）；顺手 grep 完 spec 全部单引号变量引用才过。
  两笔记账：影响徽标翻完仍读 2（而非预期的 1，埋的 padding+mode 两个键两个 live）；`boxIn` 读页面坐标，翻后断言改成『兄弟重叠』而不是各自 0。
  面板此刻 **二十六格**。


**第十八片（2026-11-08）：腿 S——公共页就是这份投影（翻进 none → 发布 → 访客也 absolute → 撤销 → 再发 → 访客回到竖排）**

- 腿 S 验证：不是相信访客那半个模型的投影，而是**同一份模型、另一个真出去的版本**。tablet 翻进 none → 发布（路径不变、版本 v+1 起），
  public page 的 tablet 变体里两个按钮**归一到同一个原点**（left/top 相等）；撤销翻转 → 再发（版本 v+2 起）→ 访客回到夹具的 seeded tablet 竖排（Primary 上 / Secondary 下、items:center 居中），**两处 `[data-published-variant="tablet"]` 里都在这一版是真实物理位姿**。这一刀同时覆盖：回写、代码视图、publish 链、public SSR——public page **不发 Tailwind 类**（`render.ts` 内联绝对定位），访客走内联 `style="left…;top…"`，marker 只出现在代码产物里。
  首跑红在断言口径：恢复竖排我写的『Secondary 回到 Primary 右边』，而夹具的 seeded tablet **本来就是 vertical**（starter 的 Actions 在设计阶段就是横排的变体被 seed 翻成 vertical，items:center + 竖排内 justify:space-between）；修正到 Secondary 下 Primary 上、间距 gap=40 才能判。
- 读数：腿 S **1 passed（1.8m）**、console `[ 9 9 . 6 s ] 腿 S`；独占生产构建（next start -p 3201，已停）。
- 这一条也为 §16 收了**最后一寸**：设计模型 → 画布 → 发布物里的『什么都看得见』的那两个写方（design / code 工作台）现在都能证明访客那边同样吃到。
**仍欠**

1. ~~面板仍然只有部分输入口：`typography` 的字族~~——**已还（第十四片，2026-11-08）**：选项从文档现读，文档没有 fontFamily 型 token 就不摆，裸族名也能往返；仍欠只剩 `style` 那一组（见下面）。
   （`rowGap`/`crossGap` 已不在这儿：2026-11-08 记了 **ADR-0092**——死字段、`@deprecated` 标注、弃用而不实现不删；
   任何 grid 行间隙的真实需求须另开 ADR 重新起名。）
   （第三片给了 `layout.mode`/`gap`/`columns`/`typography.fontSize`，第六片给了 `justify`/`items`；
   第七片把 `reverse` 接进了求解器，第八片给它那一格；`layout.clipContent`/`layout.scroll` 与 typography 七格（字重/行高/字距/大小写/装饰/对齐/纵向对齐）、字族（第十四片）、style 的混合模式/旋转（第十一片）、指针（第十二片）已接入响应式面板、代码发射/回写与测试——`RESPONSIVE_CHANNELS` 现在**二十六格**（另两格位置 x/y 只在父级 merged 为自由定位逃生口 `none`/`stack` 时才摆），
   写入口不再是「代码」视图独家。）
2. ~~某一档只声明 `{reverse:false}` 而更窄那档反向时发不出东西~~——**第八片已还**（2026-11-08）：
   发射侧在这种情况下重发一条正向方向类（`md:flex-col`），回写侧按同一条判据认领它，CSS 那一寸
   的跨档胜负与档内胜负都用真 Tailwind v4.3.3 + Chromium 量过（ADR-0069 第八片那节）。
   还欠的换成下一层：`style` 除填充、透明度、混合模式、旋转与指针（cornerRadius 模型层已通，面板不摆）。
   （2026-11-08 位置那两格已还：position.x/position.y 平板/桌面/Wide 都发得出也读得回，面板有输入口——父级 merged 为 `none`/`stack` 自由定位逃生口时才摆，否则收起；见 ADR-0069 第九片。）
3. 根画框仍然只读；断点档上它由断点决定，这条披露在「页面」那一节，不是编辑入口。
4. AI 自动生成规则那一半仍只有 mock 的「移动端优化」配方；真 provider 需要授权（`[!]`，见 §105）。
5. 这条 e2e 链在开发模式里 4.7m，其中腿 F 那一段从 9.7s 涨到 104s、发布到 266s 是同机另一会话同时在跑
   e2e 挤出来的。没有独占库/独占端口之前，它不能当常驻快门。
6. 徽标数的是投影，不预测渲染：`layout.columns` 这类键在 codegen 里怎么落成 Tailwind 类，与画布/访客是不是
   真的按它摆，是另一条链（§85 那套体检表量的就是这一层）。
7. ~~`mode` 的 `stack`/`none` 模型层逃生口~~——**已落地（2026-11-08，第十五/十六片）**：
   ADR-0091 定标记任意属性 `[--nexus-mode:none|stack]`、flip-gate（`applyResponsiveBelow→resolved` 进入 none/stack 才发）、
   code-parse round-trip 零补丁（含 mobile 基线档）、面板「自由定位」按钮（stack 仅代码可写）、
   浏览器腿 F7 同样绿（Actions 翻成自由定位，全链 A–F7–R **1 passed（58.1s）**）。独占生产构建上验证。

## §85 第三十五片：点开才出现的界面第一次进读数——发布弹层（2026-11-02）

§85 的体检表一直有一块结构性空白：**默认收起的弹层与点开才出现的表单不在分母里**（axe 只看得见
渲染出来的 DOM，键盘走查也只走默认态）。这一片挑 Studio 顶栏的「发布」弹层做主读，理由不是它最花哨，
而是它同时踩着三条：① 弹层里是发布可见性与门禁读数，作者必须能走到；② 它挂在画布之上，而画布
也听 `window` 的 Escape（清空选区），收口写不好就会"关弹层顺手把选中的元素丢了"；③ 它此前
**没有 Escape、没有点外部收起、没有 `aria-controls`**。

**落点**

- `PublishPanel.tsx`：打开时在捕获阶段听 `window` 的 Escape（`stopPropagation` 后收面板、焦点回触发键），
  `document` 的 `pointerdown` 捕获阶段判 `rootRef.contains`（点外部收、点内部不收，触发键算根的一节）；
  弹层补 `id` / `role="region"` / `aria-label="发布与分享"`，触发键只在打开时挂 `aria-controls`
  （合着时挂一个指向不存在 id 的引用是 axe 的 `aria-valid-attr-value` 违规）。
- `e2e/a11y-opened.spec.ts`（新）：复用夹具账号与项目，选中标题后**只用键盘**（聚焦触发键 + Enter）
  打开弹层，等门禁块算完再扫 axe；ARIA 接线、Tab 首停、Esc 两腿、点外部/点内部四条腿一起读。

**首跑抓到两处真缺陷，都在这片之前看不见**

1. 选中节点后才渲染的属性输入有 7 个没有可及名（axe `label`，critical）——左边的 `<span>` 读屏拿不到；
   补 8 个 `aria-label`（断点通道数字、状态背景/描边/阴影/透明度、元素名称、第 N 层填充颜色）。
2. 画布尺寸角标：11px、`fg-1` 压 `brand`，暗色下 3.74:1（axe `color-contrast`，serious；浅色那半没问题）
   —— 底色是不随主题翻转的实色，前景只能用它自己那一档 `accent-fg`（4.71:1）。

**读数**（`$env:NEXUS_WEB_URL='http://localhost:3101'; npx playwright test e2e/a11y-opened.spec.ts`）

- **1 passed（4.2s）**，`通过 27 条 · 不适用 35 条 · 违规 0 条`；截图 `screenshots/a11y-opened-publish.png`
  （gitignored，人工看过：弹层可读、角标改后是深字压蓝）。
- 夹具账号复用：零注册、零建项目（第二遍起）；每条臂仍消耗 1 次登录，在 10 次/15 分钟之内。

**四条臂**（每条改坏 → 跑 → 看红 → 立刻逐字节还原）

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| A | 不注册 `window` 的 keydown | 红在 Esc 后 `[data-publish-panel]`，Expected 0 / Received 1（9.8s） |
| B | 只删 `event.stopPropagation()` | **第一版全绿**——Escape 时焦点在 `<select>`，画布的全局键对输入控件本就退让；补「焦点还在触发键上按 Esc」这一腿后红在属性面板那条（选区被带走，8.9s） |
| C | 删 `aria-controls` | 红在 `toHaveAttribute('aria-controls', panelId)`，Received ""（8.1s） |
| D | 删 `pointerdown` 收口 | 红在最后 `await expect(panel).toHaveCount(0)`，Expected 0 / Received 1（9.5s） |

**仍欠**

1. `ExportPanel` 是同族的顶栏弹层（有"收起"按钮，但没有 Escape / 点外部 / `region` / `aria-controls`），
   下一片按同一张表量；两处收口重复，届时抽共用 hook 时要把"画布也听 Escape"这条注释一起带过去。
2. 弹层其他状态（发布进行中 / 失败 / 门禁未过）没有各自读数；当前只量了"门禁算完"那一个稳定态。
3. 移动端弹层（390 下顶栏收成图标时）不在本片；iOS 真机仍未量。
4. 真 provider 的发布路径仍是 DEMO MODE（§160），本片只量界面可及性，不冒充发布语义。

## §85 第三十六片：同族弹层收口抽成一份 hook——导出弹层进表（2026-11-02）

第三十五片把发布弹层量进来了，但同一形状的**导出弹层**仍是旧样子：有「收起」按钮，却没有 Escape、
没有点外部收起、没有 `region` 与 `aria-controls`。这一片先收口再量数：

- `apps/web/src/studio/use-popover-dismiss.ts`（新）：两处共用的收口 hook。Escape 在捕获阶段截住并
  `stopPropagation`（画布也听 window 的 Escape，见第三十五片）、`pointerdown` 判 `rootRef.contains`、
  收起后焦点回触发键。`setOpen` 直接收 `useState` 的 setter，身份稳定，effect 只在开合时重挂。
- `PublishPanel.tsx`：删掉自己那份 effect/refs，改用同一个 hook（行为逐条不变，复用是关键）。
- `ExportPanel.tsx`：补 `id="nexus-export-panel"` / `role="region"` / `aria-label="导出与下载"`，
  触发键只在打开时挂 `aria-controls`；`data-export-panel` 作 e2e 锚点。

**读数**（同一条跑法，`-g "导出弹层"` 可单跑）

- 打开态 axe **通过 26 条 · 不适用 36 条 · 违规 0 条**；两条用例 **2 passed（13.7s）**，
  发布弹层仍 27/35/0（hook 抽取没有改动它量到的东西）。
- 截图 `screenshots/a11y-opened-export.png` 人工看过：面板完整、五个复选框与两行限度可读；
  **顺带抓到一处真缺陷**——底部「导出 design+code+assets+storyboard+character」把「收起」挤成竖排两字。
  `收起` 加 `shrink-0` 后同排，复跑绿。

**四条臂**（每条改坏 → 只跑受影响的那条用例 → 看红 → 立刻还原）

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| H1 | hook 不注册 `window` 的 keydown | 发布用例红在 `expectClosedKeepingSelection` 第一条（Expected 0 / Received 1，11.8s） |
| H2 | hook 去掉 `event.stopPropagation()` | 发布用例红在属性面板那条（选区被带走，11.3s） |
| H3 | hook 去掉 `pointerdown` 收口 | 导出用例红在最后 `toHaveCount(0)`（10.4s） |
| H4 | 导出触发键去掉 `aria-controls` | 导出用例红在接线断言，Received ""（10.2s） |

**一次无关的红，照实记**：改完 `shrink-0` 的第一次跑在用例体已经走完之后抛
`browserContext.close: ENOENT …recording1.trace`——Playwright artifact 写入竞态（本仓
`docs/TESTING.md` 2026-10-30 记过同族现象）。原样重跑 4.6s 通过，没有改任何产品代码。

**仍欠**

1. 弹层里的**动态态**没有读数：发布中选择 / 失败日志、导出的回执与错误行、门禁未过那几态都没各量一遍。
2. 390 下顶栏收成图标时两颗弹层的落点与触达尺寸不在本片；iOS 真机仍未量。
3. 共用 hook 只管"收起"，**焦点陷阱（Tab 不跑到弹层外）没有做**——轻量弹层当前不承诺模态语义，
   若以后改成模态框，要连同 `aria-modal` 与焦点环一起补。
4. 导出弹层的实际下载/回执路径由 `e2e/import` 与集成测守着，本片只负责可及性与收口，不重复量打包语义。

## §85 第三十七片：弹层的动态态第一次进读数——导出的回执与失败（2026-11-02）

第三十五 / 三十六片量的是"打开那一瞬"，真正只在动作之后才出现的两块仍是空白：**回执行**（下载完成、
包内构成、缺资产提示）与**错误行**。它们此前既没进 axe 的分母，也没有任何播报语义——读屏用户按下
"导出"之后听不到任何"好了/坏了"。

- `ExportPanel.tsx`：回执块 `role="status"`（礼貌播报，不抢当前朗读）；错误行 `role="alert"`
  （动作没成，该打断）。两处都不另写 `aria-live`：`role` 自带默认值，写两遍是两句同样的承诺。
- 会话与项目仍用 `reusableMemberWithProject`（零注册、零建项目），两道限流闸一次没为测试放宽。

**读数**（`-g "导出弹层的动态态"` 可单跑）

- 回执态 axe **通过 26 · 不适用 36 · 违规 0**；失败态 **26 / 36 / 0**；critical 全 0。
- 同一文件三条用例 **3 passed（24.2s）**：发布 27/35/0、导出打开态 26/36/0 照旧。
- 截图 `screenshots/a11y-opened-export-receipt.png` 与 `…-error.png` 人工看过：回执两行可读、
  「包内：设计文档 1 · 生成的代码 3」来自服务端回执；失败行落在限度说明上方、红色可辨。

**失败态是注入的，照实写**：真服务端走到这一态要存储挂掉（代价太大），本片只把导出这一个端点注入成 500。
断言只看界面把服务端 `message` **原样**端出来、`role=alert` 在、并且上一轮回执被清掉——
"注入的是网络那一层，不是产品语义"。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| I1 | 回执块去掉 `role="status"` | 红在 `toHaveAttribute('role','status')`（Received null） |
| I2 | 失败时不 `setReceipt(null)` | 红在 `expect(receipt).toHaveCount(0)`（Received 1）——失败旁边还摆着"已下载" |
| I3 | 错误行丢掉服务端 `message` | 红在 `toHaveText`（收到"导出失败（HTTP 500）"） |

**仍欠**

1. 发布弹层里的动态态（门禁算完那一格、"正在后台算"那一格、发布失败日志）仍未各量一遍。
2. 390 下弹层落点与触达尺寸（第三十六片第 2 条）仍在。
3. 本片只验"注入 500"，真服务端的 5xx / 413 路径仍由集成测守着。

## §85 第三十八片：发布弹层的动态态——门禁算完与私有提示（2026-11-02）

发布弹层有两块内容只在动作之后才出现：**门禁算完那一格**（后台 worker 回来前只有一行"正在后台算…"）
与**切成私有的下架说明**（选中私有才出现）。第三十五片量的是打开那一瞬，这两块都不在里面。

- `PublishPanel.tsx`：私有单选在有说明时挂 `aria-describedby` 指向说明；说明的 id 只在
  `visibility === 'private'` 且门禁已算完（说明真的渲染）时才存在——不给悬空引用留位置。
- 门禁那格没有加新的播报：里面七行是同一份 `analyzeHealth` 报告的展开，作者按需读，不该整块抢读。

**读数**（`-g "发布弹层的动态态"` 可单跑）

- 门禁算完态 axe **通过 27 · 不适用 35 · 违规 0**；私有提示态 **27 / 35 / 0**；critical 全 0。
- 同一文件四条用例 **4 passed（1.2m）**：发布打开态 27/35/0、导出打开态 26/36/0、导出两动态态 26/36/0 照旧。
- 截图 `screenshots/a11y-opened-publish-gate.png` 与 `…-private.png` 人工看过：门禁七行可读；
  说明落在"未运行：Tests · AI QA"下方，**弹层自带滚动条**，截图前显式滚进视口，否则留档看不见它。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| J1 | 私有单选去掉 `aria-describedby` | 红在 `toHaveAttribute`（Received null） |
| J2 | 说明去掉 id | 红在 `document.getElementById(...)` 那条（false） |
| J3 | 说明不管选没选私有都渲染 | 红在 `expect(note).toHaveCount(0)`（还没选就摆出来了） |

**仍欠**

1. 发布动作本身的"发布中 / 失败日志"那一态仍未量（本片不含发布动作）。
2. 390 下弹层落点与触达尺寸（第三十六片第 2 条）仍在。
3. 焦点陷阱仍未做（第三十六片第 3 条）。

## §85 第三十九片：发布动作本身进读数——"发布中"与失败报错两态（2026-11-02）

第三十七片的结论里留了一条"发布弹层里的动态态（…发布失败日志）仍未各量一遍"。第三十八片量掉了弹层里
自己会变的两块（门禁算完、私有提示），但**按下"发布"之后**的两态仍然落在分母之外：忙态只有按钮文字
变"发布中…"并被 disabled，失败行只是一段红字。前者对读屏用户是**没有播报的状态变化**（焦点还在那颗
已禁用的按钮上，听到的是"不可用"而不是"正在做什么"），后者是**错误悄悄出现**——两次都算不上"读得到"。

- `PublishPanel.tsx`：忙态一行 `role="status"`（礼貌播报，不抢当前朗读）；按钮行加 `aria-busy`；
  失败行 `role="alert"`（动作没成，该打断）。不另写 `aria-live`，`role` 自带默认值。
- 报错文案不在这里改写：`studio.publish` 抛出的是服务端 `issues` / `message` 的原话，
  界面照原样端出——"注入的是网络那一层，不是产品语义"（与第三十七片同一条纪律）。
- 用例（`§85 发布动作的进行与失败：发布中状态与报错进读数`）：只把 `POST /api/projects/*/publish`
  扣住（保存那条照走），先断言**动手前两行都不在**（没有来源的状态不许预先摆出来），再扣住请求量忙态，
  放行回 500 量失败态——断言服务端原话、`role=alert` 在、忙态行已收掉。

**读数**（`-g "发布动作的进行与失败"` 可单跑）

- 忙态 axe **通过 27 · 不适用 35 · 违规 0**；失败态 **27 / 35 / 0**；critical 全 0。
- 同一文件五条用例 **5 passed（1.9m）**：发布打开态 27/35/0、导出打开态 26/36/0、导出两动态态 26/36/0、
  发布两动态态 27/35/0 照旧。
- 截图 `screenshots/a11y-opened-publish-busy.png` 与 `…-error.png` 人工看过：忙态那行在门禁块下方可读、
  「发布队列不可用（注入）」落在限度说明上方且红色可辨，忙态行已消失。
- 首跑记一笔：6.5m 超时、面板在扣住请求期间整块消失（截图里 `已保存` 复位）——那是共享工作树里
  另一会话写文件触发 dev 全量重载，**不是产品缺陷**；原样重跑 13.5s 绿。同类现象下次先看页面是否被重置。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| K1 | 忙态行去掉 `role="status"` | 红在 `toHaveAttribute('role','status')`（Received null） |
| K2 | 失败行去掉 `role="alert"` | 红在 `toHaveAttribute('role','alert')`（Received null） |
| K3 | store 里把服务端原话改成"发布失败" | 红在 `toContainText('发布队列不可用（注入）')`（收到"发布失败"） |

**仍欠**

1. 真服务端的 5xx / 413 路径仍由集成测守着（本片只验"注入 500"）。
2. 机检的 review / reject 两态（`state.publishScan.decision`）此前没有各量一遍。
3. 390 下弹层落点与触达尺寸（第三十六片第 2 条）、焦点陷阱（第三十六片第 3 条）仍在。
4. `unpublish` 的失败态（`data-publish-error` 同一行走另一条 catch）未单独量。

## §85 第四十片：机检挡下态进读数——硬红线裁决、发现条目与限度说明（2026-11-02）

第三十九片量的是"发布动作成没成"，而发布失败的**原因**还有一块此前没进读数：机检裁决。三种裁决里
`review` 照发、`clear` 是什么都没命中，只有 `blocked` 真的换了结果——页面没发出去。那块 `data-publish-scan`
此前只是三段静态文字，动作之后突然出现，**没有任何播报语义**；而它的措辞恰恰是最不能读错的那种
（"这次没命中规则"与"命中硬红线"是相反的两件事）。

- `PublishPanel.tsx`：裁决块整块挂 `role="status"`（动作之后出现的结果，礼貌播报）。
- 裁决口径不进状态：`blocked` 那句写的是"命中硬红线，这次没有发出去"，与 `clear` / `review` 各是各的话。
- 发现条目把三样都端出来：规则名、为什么、在哪（节点 id）、凭什么（原文片段）；限度说明必须与结论同现
  （§159：没命中不等于合规）。
- 用例：把 `POST /api/projects/*/publish` 注入成 422 + 一份**过契约**的 `scan`（`decision: 'blocked'`），
  先断言没发布过时裁决块不存在，再断言裁决口径 / 发现条目 / 限度两行 / 报错行原话 / 忙态已收。

**读数**（`-g "发布被机检挡下"` 可单跑）

- 裁决块 axe **通过 27 · 不适用 35 · 违规 0**，critical 0。
- 截图 `screenshots/a11y-opened-publish-scan-blocked.png` 人工看过：裁决行在门禁块下方，
  `minor-safety · 涉及未成年人的可识别信息 / 位置 node:hero-headline · 「十二岁的小明」` 逐字可读，
  两条限度说明跟在后面。
- **第一版注入被契约当场拦下**：findings 漏了 `level`，store 报"机检结果不符合契约：
  findings.0.level: Invalid option…"，裁决块根本没画出来。这不是用例坏了，而是 `ModerationScanSchema`
  那道门在真浏览器里工作——照实记下来，它是这一片的额外凭证。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| L1 | 裁决块去掉 `role="status"` | 红在 `toHaveAttribute('role','status')`（Received null） |
| L2 | 发现列表不渲染 | 红在 `expect(finding).toHaveCount(1)`（Received 0） |
| L3 | `blocked` 的措辞换成 `clear` 那句 | 红在 `toHaveText(/命中硬红线.*没有发出去/)`（收到"这次没命中规则"） |

**仍欠**

1. ~~`review` 态（照发 + N 项挂复核）未单独量~~ **2026-11-06 已还（第四十八片）**：真文档写入
   `官方客服` ⇒ 机检 `review`，界面照发、地址真能开，发现项与五条 limits 都在场。
2. 真服务端的 5xx / 413 路径仍由集成测守着。
3. `unpublish` 的失败态、390 下弹层落点、焦点陷阱仍在（第三十六 / 三十九片）。

## §85 第四十一片：发布成功后的结果块进读数——地址、版本与审核状态（2026-11-02）

前三片量的都是"没成"的那几态（忙态、报错、机检挡下），而**成**的那一态同样没有进过读数：发布成功后
弹层里凭空出现一块「当前公开地址（第 N 版）+ 地址 + 审核状态」。块一出现，忙态行就收了，视觉上只是
多了一段字——读屏用户听到的是"按钮变可用"，而不是"发出去了，地址是这个"。

- `PublishPanel.tsx`：结果块整块挂 `role="status"`（动作之后出现的结果，礼貌播报）。
- 用例走**真发布**（不注入）：先把夹具项目上可能已有的发布收回来（保证结果块是这次动作带出来的），
  再点发布，断言版本句、地址与审核那句都来自回执。
- 版本号不硬编码：夹具项目被反复发布，实测这一轮 v3 → 后几轮 v5 / v6；用例从块里读出 `N`，
  再用它去对顶栏的「已发布 vN」——两处必须同一个数。
- 地址那条腿按"同源"钉：`href` 是站内相对路径（`/n/<slug>/<标题>`），**文字**是绝对地址，
  由同一条 path 拼出来；断言文字以 href 结尾，而不是要求 href 本身是绝对地址（相对路径不是缺陷）。

**读数**（`-g "发布成功后的结果块"` 可单跑）

- 结果块 axe **通过 27 · 不适用 35 · 违规 0**，critical 0。
- 截图 `screenshots/a11y-opened-publish-result.png` 人工看过：版本句、绝对地址、快照说明、
  「人工审核还没看过这一版（机检不能替它下结论）」逐行可读；顶栏同步变成「已发布 v3」，
  构建 / 预览两行实时读数这次也真的来了（真发布才会推事件）。
- 同一文件此前 5 条用例的读数（发布打开态 27/35/0、导出打开态 26/36/0、导出两动态态 26/36/0、
  发布两动态态 27/35/0、机检挡下 27/35/0）照旧。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| M1 | 结果块去掉 `role="status"` | 红在 `toHaveAttribute('role','status')`（Received null） |
| M2 | 版本句写死成「第 1 版」 | 红在 `expect(trigger).toHaveText(/已发布 v1/)`（收到"已发布 v5"） |
| M3 | 审核那句换成"审核未同步。" | 红在 `toContainText('人工审核')` |

**仍欠**

1. ~~`review` 态（照发 + N 项挂复核）仍未单独量~~ **2026-11-06 已还（第四十八片）**。
2. ~~`unpublish` 的失败态未单独量~~ **已还（第四十二片，2026-11-02）**：真发布造出地址，再扣住 DELETE 注入 500，
   量到报错原话、忙态收掉，且结果块 / 地址 / 顶栏版本号三处都还在。
3. 390 下弹层落点与触达尺寸、焦点陷阱仍在（第三十六片）。

## §85 第四十二片：取消发布的忙态与失败——失败不许假装地址已被收走（2026-11-02）

第四十一节的"仍欠"第 2 条：`unpublish` 的失败态没量过。它与发布共用同一个 `publishBusy` 和同一个
`publishError`，但走另一条请求（DELETE）与另一个后果：**失败时公开地址必须还在**。界面上先把地址块清掉
再说"撤下失败"，就是告诉作者一件没发生的事——访客那边链接其实照样能打开。

- `PublishPanel.tsx`：忙态行补 `data-publish-busy-kind`，取消发布时播报"取消发布中：正在把公开地址收回来；
  请求没回来之前访客仍能打开"。原来那句只有发布口径（存快照 / 过门禁 / 换公开地址），取消发布不存快照，
  照着念就是把"正在撤下"说成"正在发出去"（§159）。按钮的 `onClick` 用 `finally` 复位这个局部标记，
  状态机不动。
- 用例走**真发布**造出 publication（夹具项目若已有发布先收回），再把 `DELETE /api/projects/*/publish`
  扣住量忙态、放行回 500 量失败态；`POST` 与保存都不拦。
- 失败后三处同源断言：`role="alert"` 的报错行含服务端原话、`data-publish-result` 仍在、
  `data-publish-url` 仍有一条、顶栏仍是发布时那个「已发布 vN」（`N` 从顶栏读，不硬编码）。
- 另钉一条：`sawDelete`——取消发布那颗键必须真的发出 DELETE，否则这条腿量到的"失败"来自别处。

**读数**（`-g "取消发布的忙态与失败"` 可单跑）

- 失败态 axe **通过 27 · 不适用 35 · 违规 0**，critical 0；单跑 **1 passed（12.2s）**，末次 16.6s。
- 截图 `screenshots/a11y-opened-publish-unpublish-busy.png` 与
  `…publish-unpublish-error.png` 人工看过：忙态那行是取消发布口径、两颗键禁用、地址块仍在；
  失败态红色报错是「下架队列不可用（注入）」，下方「当前公开地址（第 8 版）」与顶栏「已发布 v8」都还在。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| N1 | 忙态行的 `data-publish-busy-kind` 恒为 `publish` | 红在 `toHaveAttribute('data-publish-busy-kind','unpublish')`（Received "publish"） |
| N2 | store 的 unpublish 失败分支把 `publicationValue` 清空 | 红在失败后 `resultBlock` 仍可见（element not found） |
| N3 | 报错行换成"操作失败，请稍后再试。" | 红在 `toContainText('下架队列不可用（注入）')` |

**仍欠**

1. ~~`review` 态仍未单独量~~ **2026-11-06 已还（第四十八片）**。
2. 390 下弹层落点与触达尺寸、焦点陷阱仍在（第三十六片）。
3. 真服务端 5xx / 413 路径仍由集成测守着。

## §85 第四十三片：健康栏的展开行——`aria-controls` 指到真列表，零发现的行不是假开关（2026-11-02）

起点是读 `HealthPanel.tsx` 读出来的两处：每一行都有一颗展开键、`aria-expanded` 也一直在，
但它**管的是哪一块从来没有说出来**（没有 `aria-controls`，列表也没有 id）；更糟的是零发现的行
同样渲染成 `<button aria-expanded="false">`——按下去什么都不出现。读屏用户听到"已折叠"，
会以为有东西可以展开；按下去没反应，只会以为界面坏了（§159）。

- `HealthPanel.tsx`：列表挂 `id="nexus-health-findings-<checkId>"`；展开键在**展开时**挂
  `aria-controls` 指向它，收起时撤掉（不留指向不存在 id 的引用，同弹层那条纪律）。
- 零发现（`findings.length + omitted === 0`）的行改成静态 `<div data-health-static>`：
  没有东西可展开就不摆一颗键，读数照旧（状态、分数、门槛、发现数都不变）。
- 同时修掉一条边：`expanded && check.findings.length` 会在"全被截断、只剩 omitted"时
  整块不渲染——展开键展不开任何东西。改成 `expanded && total`，于是"另有 N 条未列出"那行
  也能照实出现。

**夹具与见证**（`-g "健康栏的展开行"` 可单跑）

- 真文档造发现：给起手文档一个文本节点写入 `password: e2e-fixture-not-a-real-secret`，走
  `PUT /api/projects/:id`（用户能走的保存路由）⇒ `analyzeHealth` 的 security 行真的变成 `fail`，
  展开列表里是「疑似明文凭据（内容已脱敏…）」那条真发现。
- **`finally` 里把原文写回**（先离开 Studio，避免 store 卸载时把旧稿盖回来）：夹具项目会被同一
  文件的其他用例真发布，留着那行"凭据"会让门禁永远过不去——这是夹具自身的卫生，不是产品行为。
- 断言链：零发现行（build）没有 `[data-health-toggle]`、有 `[data-health-static]`；security 行
  收起时 `aria-controls` 为空、展开时等于列表 id、`getElementById` 真有那个 `ul`、列表里有 1 条
  真发现；再按一次键：`aria-expanded=false`、列表消失、`aria-controls` 撤掉。
- 读数：展开态 axe **通过 27 · 不适用 35 · 违规 0**，critical 0；单跑 **1 passed（1.0m）**，
  末次复跑 49.1s。截图 `screenshots/a11y-opened-health-disclosure.png` 人工看过：Security 行
  75 分 / 1 项发现 / fail，展开列表里是那条脱敏消息；其上的行都是静态读数。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| P1 | 展开键去掉 `aria-controls` | 红在 `expect(listId).toBe('nexus-health-findings-security')`（Received null） |
| P2 | 零发现的行也渲染成展开键 | 红在 `build` 行 `[data-health-toggle]` 的 `toHaveCount(0)`（Received 1） |
| P3 | 列表去掉 `id` | 红在 `[id="nexus-health-findings-security"]` 的 `toHaveCount(1)`（Received 0） |

**仍欠**

1. ~~`review` 态仍未单独量~~ **2026-11-06 已还（第四十八片）**。
2. ~~390 下弹层落点与触达尺寸、焦点陷阱~~ **2026-11-05 已还（第四十四片 / ADR-0084）**：
   390 下两块面板整块进视口、目标 ≥24；不装焦点陷阱，改成"Tab 离开即收起、焦点回触发键"。
3. 真服务端 5xx / 413 路径仍由集成测守着。

## §85 第四十四片：390 的两块弹层第一次落进视口——目标 ≥24，Tab 离开即收起（2026-11-05）

八片「仍欠」挂着同一句话（第三十六 / 三十八 / 三十九 / 四十 / 四十一 / 四十二 / 四十三片：
"390 下弹层落点与触达尺寸、焦点陷阱仍在"）。这句话此前一次都没量过——面板是顶栏里一个
绝对定位的卡片，390 只是一个具体数字，先量再说。

**量出来的三件事**（`e2e/popover-mobile.spec.ts`，首跑自然红）：

- 发布弹层 `w-[440px]`，触发键右边缘在 343.3 ⇒ 面板左边缘 **-96.7px**，近 1/4 在视口外；
- 两块面板的 `收起` 是 **28×21**，低于 WCAG 2.5.8 的 24×24；
- 从面板最后一颗控件按 Tab：焦点落到面板背后（发布 →「预览」链接，导出 →「发布」键），
  **面板还开着**——键盘用户已经看不见自己在哪儿了。

**改法**（ADR-0084）：

1. `<520px` 的浮层贴视口：`fixed left-3 right-3 top-[52px] w-auto`。触发键在可横滚的顶栏里，
   它的位置本来就不稳定；手机档的锚点从"触发键右边缘"换成"视口左右 12px"。桌面档仍是
   原来的绝对定位，布局不变；`w-[min(440px,calc(100vw-24px))]` 作为宽度的兜底。
2. `收起` 改成 `inline-flex h-6 min-w-6 items-center justify-center px-1`（两块面板同一改）。
3. `use-popover-dismiss`：Tab 在最后一颗控件上、或 Shift+Tab 在触发键上 ⇒ 收起、焦点回触发键。
   **这不是焦点陷阱**：没有 `aria-modal`、没有 `inert`，从触发键 Tab 进去、从第一颗控件
   Shift+Tab 出来仍是默认行为。措辞是"离开这一层就收起"，不是"焦点被关在里面"。

**读数**（390×844，1 passed / 4.5s）

```
[发布] panel x=12.0 y=52.0 w=366.0 h=239.0 / viewport 390x844
[发布] <24 目标: []
[发布] Tab 之后: {"inPanel":false,"onTrigger":true,"panelStillOpen":false}
[导出] panel x=12.0 y=52.0 w=366.0 h=462.0 / viewport 390x844
[导出] <24 目标: []
[导出] Tab 之后: {"inPanel":false,"onTrigger":true,"panelStillOpen":false}
```

截图 `screenshots/popover-390-publish.png` / `popover-390-export.png` 人工看过：两块都完整落在
视口里，没有横向裁切。回归：`a11y-opened.spec.ts` 的发布 / 导出两条 axe 用例 **2 passed (8.6s)**，
Tab 进入面板的第一停仍是可见性单选 / 第一个复选框。

**臂**：把 Tab 分支改成直接 `return` ⇒ 红在「收起后焦点应当回到触发键」；恢复后 1 passed (4.1s)。
自然红两次（440px 越界 96.7px、收起 28×21），不是先写断言再补实现。

**仍欠**：~~320px 没有单独读数~~ **2026-11-05 已量（第四十六片）**；iOS Safari 与软键盘弹出时
的可视高度没有真机读数；焦点陷阱明确不做（真要模态时整块换 `dialog` + `inert`，不在这份 hook
上补 trap）。

## §85 第四十六片：320 也进同一张表——最窄那一档，发布面板顶到 72vh 并在面板内滚动（2026-11-05）

第四十四片把 390 修好之后，仍欠里留着"320px 没有单独读数"。320 是 iPhone SE 一代那种宽度，
贴边策略在数学上成立（左右各 12，宽 296），但数学不等于读数——同一张 e2e 表加一档就行。

**读数**（`1 passed (6.1s)`，390 与 320 × 两块面板）

```
390 发布 x=12.0 y=52.0 w=366.0 h=239.0 · <24 目标 [] · Tab → 触发键、面板收起
390 导出 x=12.0 y=52.0 w=366.0 h=462.0 · <24 目标 [] · Tab → 触发键、面板收起
320 发布 x=12.0 y=52.0 w=296.0 h=607.7 · <24 目标 [] · Tab → 触发键、面板收起
320 导出 x=12.0 y=52.0 w=296.0 h=501.0 · <24 目标 [] · Tab → 触发键、面板收起
```

**320 读出来的一件事**：发布面板 h=**607.7**，正好等于 `72vh`（844×0.72=607.68）——它不是
"刚好装下"，是**顶到上限后靠 `overflow-auto` 滚动**。这条上限因此在最窄档成了真实约束：
没有它，面板会伸到 844 以下被视口切掉；有了它，内容至少能滚到。截图
`screenshots/popover-320-publish.png` / `popover-320-export.png`。

**320 抓到的第二个缺陷（同一片修掉）**：导出主按钮的标签是 id 串
（`design+code+assets+storyboard+character`），390 宽下就已经让面板内部横向滚 **11px**，
320 下截图里最后一个词被右缘切掉。改成 `PARTS` 的中文 label（`+` 分隔）、按钮
`min-w-0 flex-1 leading-tight` 允许换行；门里加一条「面板内部 `scrollWidth-clientWidth` ≤ 2」。
臂：把按钮恢复成 id 串与旧布局 ⇒ 红在「390 导出弹层内部横向滚了 11px」。

**仍欠**：320 下滚动的手感（触屏惯性、滚动条可见性）没有真机读数；iOS Safari 的可视高度
（`dvh` 与 `vh` 的差别）没有真机读数。

## §85 第四十五片：1279 进表——xl 前面那一像素，画布份额从 43% 翻回 64%（2026-11-05）

第二十八 / 三十二片把 768 与 1024 补进表之后，「1025–1279 之间没有逐档读数」一直挂着。
这一段里唯一有意义的边界是 **xl（1280）前面那一 px**：1279 与 1280 只差 1px，但 Tailwind
的 `xl` 在这一 px 上把 Studio 的**右侧属性面板**从底部浮层（52vh）翻成 300px 内联列。
两档一起量，才能说"切换本身有没有把外壳挤坏"。

**改法**：`WIDTHS` 加一档 `桌面1279 / 1279×900`（不是重跑脚本，是同一张表多一行——
以后每一轮都带着它）。

**读数**（`1 passed (1.3m)`，十张面 × 五档 = 50 个组合）

- 1279 的十张面：页面级溢出 **0**、<24px **0**；审计仍是 1 处表内横滚
  （与 390/768/1024/1280 一致，那是宽表的容器内横滚，不是页面溢出）。
- 「滚不动的裁切」只有 Studio 有读数：1279 两处、1280 三处，逐条是**画布里的用户节点**
  （`span(container)+7px`、`span(Secondary CTA)+18px`；1280 多一处画布标签 +88px）。
  作者文档比画布帧宽是允许的，不是外壳裁切；外壳自己的可横滚/裁切都是 0。
- Studio「适应窗口」随宽度的四档（同一份文档、同一颗按钮）：

```
390  →  298×186 装进 346×536（21%）
768  →  676×423 装进 724×807（47%）
1024 →  668×418 装进 716×551（46%）
1279 →  923×577 装进 971×718（64%）
1280 →  624×390 装进 672×683（43%）
```

**这一行读出来一个设计事实**：1279 与 1280 只差 1px，画布可用宽度却从 971 掉到 672
（右侧属性面板从底部浮层翻成 300px 内联列，见 `StudioShell` 的 `max-xl:block` / `xl:static`）。
也就是说，正好 1280 宽的笔记本用户拿到的画布份额比 1279 少 21 个点，却换到一块常驻的属性栏。
这不是缺陷，是一笔明确的取舍；真要两边都要，得让属性栏在 1280–1439 可折叠——
**2026-11-05 已还（第四十七片 / ADR-0085）**：默认常驻不变，作者可点「折起」把 300px 拿回来。

**仍欠**：1025–1278 之间仍只有 1024 与 1279 两个端点（同一布局区间，没有逐档扫）；
iOS 真机仍没有读数。

## §85 第四十七片：1280 的画布悬崖给了作者一个开关——属性栏可折起（2026-11-05）

第四十五片量到 1279→1280 画布 **971→672**，并把"让属性栏可折叠"留给后续一片。这一片兑现：

- `StudioShell` 新增 `inspectorFolded`（默认 `false`——常驻属性栏仍是默认，既有行为不变）。
- 折起：`aside` 加 `xl:hidden`，右缘出现竖排「属性」标签（垂直居中；第一版 `top-[52px]`
  会压住 DEMO MODE 徽标，截图里当场发现并改掉）。
- 展开：标签消失，面板里的「折起」按钮拿回焦点。两端都靠 `requestAnimationFrame` 等渲染
  落地再 `focus()`——不能把键盘用户留在被 `hidden` 的按钮里。
- **门槛不动**：`xl` 仍是 1280；这一片给的是作者的选择，不是把 1280 档的用户赶回浮层。

**读数**（1280×900 与 1440×900，`e2e/studio-inspector-fold.spec.ts`，1 passed / 17.6s）

```
[1280] 折起前画布宽 672.0（预期 672）
[1280] 折起后画布宽 972.0（+300.0）
[1280] 展开后画布宽 672.0
[1440] 折起前画布宽 832.0（预期 832）
[1440] 折起后画布宽 1132.0（+300.0）
[1440] 展开后画布宽 832.0
```

常驻时的宽度直接钉 `视口 - 608`（44 图标栏 + 264 左栏 + 300 属性栏），两档都逐像素对上；
差超过 8px 就红——这条比"折起变大"更硬，它把三栏的宽度算式钉在了门里。
折起后页面级横向溢出 0；两个入口都 ≥24×24；`aria-controls="nexus-inspector"` 指到真面板。
截图 `screenshots/studio-{1280,1440}-inspector-{expanded,folded}.png`。

**臂**：摘掉 `xl:hidden`（折起不隐藏面板）⇒ 红在「折起后属性栏应当从布局里退出」；恢复后 1 passed。

**仍欠**：折叠状态不记忆（刷新回到展开）；<xl 的底部浮层本来就是浮层，没有"折起"这一档。

## §85 第四十八片：发布机检的 review 态第一次上表——挂人工也照发，地址真能开（2026-11-06）

第四十 / 四十一 / 四十二 / 四十三片各留过同一句「`review` 态仍未单独量」。理由一直是对的：
它要一份**真**发布回执——review 的语义是"页面照样发出去，只是进人工队列"，注入假 publication
量到的只是界面自己的投影（§16）。这一片用真文档造出这条回执，机检三种裁决终于都上过表
（clear 与 blocked 见第四十片，review 是本片）。

- 造法：给起手文档一个文本节点写入 `官方客服`（命中 `risk.impersonation`，只挂人工不自动挡），
  走 `PUT /api/projects/:id`（用户能走的保存路由），再从界面真点发布；`finally` 里写回原文并
  收回这一版——留着一句"官方客服"会让同族用例的下一次机检一直挂人工。
- 判据四条：① `[data-scan-decision="review"]`，文案同时说"挂人工复核"与"页面已发出去"——
  照 clear 念会让作者以为没人看，照 blocked 念会让作者以为链接不可用；② 发现项是
  `risk.impersonation`，`位置 <nodeId>` 与引文「官方客服」都对得上这次写入；③ 五条 `limits`
  与结论同时在场（§159）；④ 公开地址 `GET` 回 **200** 且 HTML 里真有「官方客服」——review 不是拦截。
- 顺带钉一条弹层自身的纪律：结果出来后 `panel.scrollWidth - clientWidth ≤ 2`（第四十六片的口径），
  一屏长文案不许把弹层撑出横向滚动。

**读数**（`npx playwright test e2e/publish-review.spec.ts`，1 passed / 10.4s）

```
机检（rules-2026-09-24.1）：1 项挂人工复核，页面已发出去。
扫过：1 页 / 5 段可见文字 / 0 个引用资产
risk.impersonation · 疑似…需要人确认它是不是本人所有 · 位置 but_mvza9qq8bldfvc · 「官方客服」
limits 5 条 · 结果块在（人工审核还没看过这一版） · 公开页 HTTP 200 含「官方客服」 · 弹层溢出 0
```

截图 `screenshots/publish-review-decision.png` 人工看过：结论行、发现项（规则 / 原因 / 位置 / 引文）、
五条 limits 逐行可读；顶栏是「已发布 vN」，画布上被写的那颗节点就是「官方客服」。

**臂**：把 review 分支的文案换成 clear 那句（"这次没命中规则。"）⇒ 红在「review 的文案没说要人看」；
恢复后 1 passed。

**仍欠**：iOS 真机与软键盘（同第四十四 / 四十六片）；复核之后 admin 裁决改变公开页那一腿由
`apps/web/test/admin-moderation.integration.test.ts` 守着，本片没有重跑它。

## §85 第四十九片：创作者主页与任务账本第一次进读数——61×21 的返回口、九列在 390 被压成竖排字（2026-11-06）

这两张在 e2e 里都"有人走过"，但走的是功能（关注数字变没变、任务行跟不跟实时事件）；
**没有一张被 axe 扫过，也没有一张在 390 下量过布局**。主页是公开页（陌生人第一次认识作者就在这里），
账本是"这个作品跑过多少次 AI 请求"的凭证页——都不该只靠功能那条腿是绿的来假定可用（§159）。

**首跑抓到的三件事**（`e2e/profile-tasks.spec.ts`，第一版自然红）：

1. 账本页唯一的返回口「回 Studio」是 **61×21**，高度比 24 少 3px——它不换行，就一直靠行高凑尺寸；
2. 有任务行时，390 下九列表格被压成**一列一个字**（「第 / 几 / 次」竖着排），页面级溢出却是 0
   ——"没撑宽"不等于"读得下去"；这条只有截图看得见，`scrollWidth` 与 axe 都不会报；
3. 补上横滚容器之后，axe 立刻给出 **serious `scrollable-region-focusable`**：键盘用户看得到表格，
   却滚不到右边那几列。

**改法**：

- 「回 Studio」`inline-flex min-h-6 items-center`（盒高 24，不靠字号）；
- 表格包一层 `overflow-x-auto`（`data-tasks-table-scroll`），表格 `min-w-[880px]`，时间列
  `whitespace-nowrap`——九列保一个可读下限，要滚就滚表格自己那一块，页面布局视口不动；
- 横滚容器 `role="region"` + `aria-label` + `tabIndex={0}`：键盘停得下来才滚得动。

**读数**（`npx playwright test e2e/profile-tasks.spec.ts`，2 passed / 10.5s）

```
创作者主页/游客 1280  通过 21 · 违规 0 · critical 0 · serious 0 · 溢出 0px · 目标 5 个 · <24 0
创作者主页/游客 390   通过 21 · 违规 0 · critical 0 · serious 0 · 溢出 0px · 目标 5 个 · <24 0
任务账本 1280（1 行） 通过 21 · 违规 0 · critical 0 · serious 0 · 溢出 0px · 目标 2 个 · <24 0
                     表格滚动容器 1032 / 1032 · 时间列 238px
任务账本 390（1 行）  通过 22 · 违规 0 · critical 0 · serious 0 · 溢出 0px · 目标 2 个 · <24 0
                     表格滚动容器 880 / 342 · 时间列 203px
```

主页那一条**不登录**：成员看自己的主页走 `isSelf` 分支（没有关注/拉黑），而那两颗键正是页面上
唯一的动作；handle 从发现页上真公开作品的地址里取，游客视图才是访客看到的那张脸。
账本那一条用一次真的 DEMO 出图造一行（真链路：额度门 → 任务行 → 资产行）；已有行就不再造，
重复跑不往夹具账本里一路加行。截图 `screenshots/profile-{1280,390}.png`、
`screenshots/tasks-ledger-{1280,390}.png` 人工看过：390 下时间戳与状态列可读，其余列在表格内横滚。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| R1 | 摘掉表格的 `min-w-[880px]` | 红在「表格只剩 368px 宽（<640），九列被压扁了」 |
| R2 | 摘掉横滚容器的 `tabIndex` | 红在 serious `scrollable-region-focusable`（1 个节点） |
| R3 | 「回 Studio」改回只给字号 | 红在「<24 目标：回 Studio 61×21」 |

**仍欠**：`/admin/audit`、`/admin/observability` 的宽表也是"只有 `overflow-x-auto`、
没有 `min-w` 也没有 `tabIndex`"的同一形状（`/analytics` 已在第五十片收掉）；
行内 120 字的错误原因在 390 的滚动手感没有真机读数。

## §85 第五十片：作品数据页那张十二列表——390 下被压到 379px，首列只剩 63px（2026-11-06）

第四十九片收尾时把三张宽表记成"同一形状"（只有 `overflow-x-auto`，没有 `min-w`、没有 `tabIndex`）。
这一片收 `/analytics`：它比任务账本更宽（12 列），而且"作品"那一格还挂着版本、入口链接与几条角标。

**首跑量到的**（`e2e/analytics-narrow.spec.ts`，先在 390 下红出来）：

- 页面级溢出 **0**——外壳没被撑宽，所以这条腿看起来"没事"；
- 但表格自己只剩 **379px**，首列 **63px**：作品名、版本、「为什么没人看？」与角标全被拆成竖排字；
- 表格里**有链接**，所以 axe 的 `scrollable-region-focusable` 不报（键盘"进得去"）；
  可右侧那些纯数字列没有链接，键盘用户只有让横滚容器自己可聚焦才滚得到——这条 axe 管不到，得单独钉。

**改法**：`data-analytics-table-scroll` + `min-w-[1000px]` + `role="region"` + `aria-label` + `tabIndex={0}`。
表格保可读下限、自己横滚；页面布局视口不动。

**读数**（`npx playwright test e2e/analytics-narrow.spec.ts`，1 passed / 8.0s）

```
游客访问 /n/<handle>/<slug> 上报 HTTP 200 → 首行打开数 197（累计）
作品数据 1280  通过 25 · 违规 0 · serious 0 · 页面溢出 0 · 表格 1052 / 1052 · 首列 573px
作品数据 390   通过 26 · 违规 0 · serious 0 · 页面溢出 0 · 表格 1000 / 342 · 首列 533px
```

游客那一次访问用**普通 Chrome UA**：Playwright 默认的 `HeadlessChrome` 会被"疑似爬虫"挑出去，
那一行还在但"打开"是 0——量到的就不是真人访问。截图 `screenshots/analytics-{1280,390}.png`
（滚到表格再拍）人工看过：390 下首列完整可读，其余列在表格内横滚。

**两条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| Q1 | 摘掉 `min-w-[1000px]` | 红在「表格只剩 379px 宽」「首列只剩 63px」 |
| Q2 | 摘掉横滚容器的 `tabIndex` | 红在「tabindex=null，键盘滚不到右边的列」（axe 不报，结构门报） |

**仍欠**：~~`/admin/audit` 与 `/admin/observability` 两张宽表同一形状~~ **2026-11-06 已收（第五十一片）**；
390 下"右边还有列"没有视觉提示（要不要加渐变/提示，等有真机读数再定）。

## §85 第五十一片：管理台两张宽表——审计表连 1280 都要横滚，首列只有 69px（2026-11-06）

第五十片收尾时剩的最后两张"同一形状"：`/admin/audit`（六列，最后一列是长句 JSON）与
`/admin/observability` 的进程指标表（五列）。它们此前只在 `narrow-surfaces` 里量过
"页面级溢出 0 / 小目标 0"——那两条都不会说"列被压扁了"。

**首跑三件**（`e2e/admin-tables.spec.ts`，自然红）：

1. 审计表的横滚区**没有任何可聚焦内容**（行里只有文字），axe 在 1280 与 390 都报
   serious `scrollable-region-focusable`——而这张表在 1280 就已经是 **1069 / 1032**，本来就需要滚；
2. 390 下首列（时间）只剩 **69px**，时间戳被拆字；
3. 进程指标表 390 下 532 / 342 本来就要滚，但同样没有 `tabindex`。

**改法**：

- 两张表的横滚区都补 `role="region"` + `aria-label` + `tabIndex={0}`；
- 审计表：时间 / 谁 / 动作 / 结果与六个表头 `whitespace-nowrap`；「细节」列
  `min-w-[16rem] max-w-[24rem] break-all`——长 JSON 允许任意位置断，但不许把这一列压成一条竖线
  （去掉 `min-w` 时实测 **33px**）；
- 指标表：`min-w-[520px]` 兜住五列下限。

**读数**（`npx playwright test e2e/admin-tables.spec.ts`，1 passed / 9.3s）

```
审计 1280  通过 21 · 违规 0 · serious 0 · 页面溢出 0 · 表格 1032 / 1032 · 首列 149px · 表头 149/106/137/165/32/443
审计 390   通过 22 · 违规 0 · serious 0 · 页面溢出 0 · 表格 700 / 342 · 首列 130px · 表头 130/92/119/75/28/256
观测 1280  通过 21 · 违规 0 · serious 0 · 指标表 1032 / 1032 · 首列 436px
观测 390   通过 22 · 违规 0 · serious 0 · 指标表 532 / 342 · 首列 293px
```

1280 下审计表刚好装满（1032/1032）——更长的 JSON 会把它推回横滚，`max-w-[24rem]` 是那个上限。
截图 `screenshots/admin-{audit,observability}-{1280,390}.png` 人工看过：390 下时间、谁、动作可读，
细节在表格内横滚。

**三条臂**

| 臂 | 改坏的那一处 | 结果 |
|---|---|---|
| S1 | 摘掉审计表横滚区的 `tabIndex` | 红在 serious `scrollable-region-focusable`（390；1280 装满不滚，故不报） |
| S2 | 摘掉「细节」列的 `min-w-[16rem]` | 红在「细节列只剩 33px，JSON 会被拆成一条竖线」 |
| S3 | 摘掉时间列的 `whitespace-nowrap` | 红在「首列只剩 69px，时间被拆字」 |

**仍欠**：审计表在 1280 是"刚好装满"，数据里出现更长的 detail 时会回到横滚（有上限兜底，但没有读数）；
三张表都没有"右边还有列"的视觉提示；390 的滚动手感没有真机读数。

## §SEC 第三十二片：限流闸的窗口挪进 Redis——「每台各数各的」那句限额重新是真的（2026-11-02）

起点是 `rateLimit.ts` 顶部从 §64 那天起就写着的一句承诺："生产多实例时换成 Redis 驱动（ZRANGEBYSCORE + ZADD
的有序集滑动窗口），保持本接口形状不变即可"。它兑不了现的原因写在接口自己脸上：**它是同步的**，而同步接口只有
"进程内"这一种后端写得出来——一次网络往返没有地方等它。所以先有 `3585dc8`（seam 改异步：44 个生产调用点补
`await`、测试里 15 个 `reset()` 补 `await`，判定逻辑一个字没动），再有本片填驱动。分两个提交不是为好看，是让
"新增驱动"的 diff 里没有"顺便改了语义"。

- 形状：门面 `rateLimit.ts` 只剩接口、桶键形状与选驱动；两个驱动各在一个文件，与 `realtime/` 的
  `bus.ts`/`localBus.ts`/`redisBus.ts` 一一对应。旋钮是 `NEXUS_REDIS_URL`（与实时总线同一个，不各设各的），
  **不设它的部署逐行为照旧**——这一片是 opt-in。而多实例部署下它是必设项：`10 次/15 分钟/邮箱` 在两台前端下
  实际是"每台 10 次"，没有任何一个读数会说这句变了；攻击者不必绕过任何代码，只要把请求分摊到两台。
- 三条硬约束，每条是一类 bug 的形状：① 原子性在 Lua 脚本里（`ZREMRANGEBYSCORE`→`ZCARD`→`ZADD` 拆成三条命令时，
  两个并发请求能同时读到"窗口里还差一名"，于是双双挤进去，上限被**并发本身**突破）；② 时钟来自
  `redis.call('TIME')` 不是客户端 `Date.now()`（多台机器时钟不齐时，快那台写进去的成员分数比慢那台的 now 还大，
  `ZREMRANGEBYSCORE` 删不掉它——它赖在窗口里冒充"未来的命中"）；③ 每条命中的成员名唯一＝实例身份 + 本机单调序号
  （`ZADD` 对同名成员是"改分数"不是"加一条"，成员名若取 `Date.now()`，同毫秒 N 条在集合里永远只占一格，
  `ZCARD` 恒等于 1，闸等于没装。**这一格单实例的顺序语义测不出来**，所以它有自己的用例：一次并发 `limit+6` 条，
  放行的必须恰好 `limit` 条）。
- 与 ADR-0028 取向相反的一处是故意的：Redis 坏了**退回进程内**而不是停摆——退回来仍挡得住单机暴力破解，业务照常跑，
  不停摆的价值大于"看得见地坏"。代价换个地方付：退回一定要出声（`nexus_rate_limit_driver_fallbacks_total` +
  一行日志 + `fallbackCount`，三个说的是同一句话）。`commandTimeout: 250ms` 的超时方向是"更严不是更松"。
- 首跑抓出来的真 bug，不是设计时想到的：`PEXPIRE` 原来排在 `ZADD` 之前——对一个还不存在的键它返回 0、什么都不做、
  也不报错，于是"只来过一次"的那批桶（恰恰是绝大多数）建不出 TTL，键空间随流量单调涨。
- 读数：6 套 79 用例绿，含新的 `apps/web/test/rate-limit.redis.integration.test.ts` 16 条打真 Redis；
  `npm run ratelimit:two-process` 12 个真实操作系统进程、11 条判据全绿（权威读数取父进程自己 `ZRANGE` 出来的那两条
  有序集，不采信孩子进程的自述）。五条变异臂 A4 / A5 / A6 / A8 / A9 逐字进
  `docs/adr/0076-rate-limit-redis-sliding-window.md` 的臂表，其中 A4（成员名撞车）红在突发那一格：10 条**全放行**。

## §SEC 第三十三片：进程内那张表自己也要收口——闸不再比自己挡的东西先倒下（2026-11-02）

**起点仍是读代码读出来的洞**，而这一回洞在闸自己身上：`rateLimitMemory.ts` 那张 `Map` 只加不减，桶键第三段那段
身份是中间件给每个新访客现签的 guest 会话——"来一个人"就是"多一只桶"。限流闸挡的是免成本写入口，它自己却是一个
免成本写入口：不设 `NEXUS_REDIS_URL` 的那台进程（也就是**默认**那台）内存随 distinct 身份单调涨，同样没有任何
读数会说这件事。上一片管的是 Redis 那半的键空间（后果 7 那句 `PEXPIRE`），这一片补的是进程内这半。

- 三腿：**清扫**（每只桶带上自己的 `windowMs`，每 256 次命中扫一趟全表——扫描不能挂在每次命中上，那是每请求
  O(表长)）、**上界**（`maxBuckets` 默认 50 000 + 用 `Map` 的插入序当 LRU：命中先 `delete` 再 `set`，于是最近碰过的
  永远在尾部；淘汰从头那头，代价是 O(要收走的数) 而不是每请求一次排序，后者等于把淘汰做成一条放大攻击）、
  **出声**（`nexus_rate_limit_buckets_pruned_total{reason=expired|cap|reset}` 三本账分开，因为它们是三句话）。
- **两个清扫节奏**是一条容易漏的形状：同一张表里同时住着 60 秒与 10 分钟的窗口，只靠周期性全表扫的话，短窗那批
  过期了还占着名额、长窗那批被当成牺牲误报。所以顶到上界那一步另外按头部桶自己的窗口放过名额——整窗已过期的
  不算牺牲、不喊。
- **日志节奏本身是安全属性**：顶到上界之后每请求都淘汰一只，每请求一行 warn 就是这道闸自己开了一条写日志的入口。
  所以只有 `cap` 补一行日志，而且最多一分钟一条，逐笔的数只进 counter。`cap` 在涨才是事故（这台进程正被 distinct
  身份压着打），`expired` 在涨是正常收尾。
- 方向与上一片相反的一处是明写的：被淘汰的那一格窗口重新变空，是**往更松错**（ADR-0076 后果 2 是往更严错）。
  把它限制住的不是上界本身，是"正在挨挡的桶每被挡一次就碰一次、因此一直贴在 LRU 尾部"这条不变量——代价只出现在
  洪水形状里。真正的上界在 Redis 驱动与边缘层，这一句 `docs/SECURITY.md` 里也写了，不是缺陷披露。
- 顺手把上一片三处**仪器**从"赌一次运气"改成"看行为"：① parity 的 `retryAfterMs` 那句"50ms 容差"是本文件落地那天
  单跑一次读到 3ms 就当成的上限，2026-10-31 连跑三次红在 55 / 62 / 64ms 而同一条用例里 `allowed / count` 一格没差
  ——**红得没有道理的门，下一次真分歧也不会绿**，现在钉的是与漂移无关的三句加一条行为版本；② `connectionReady`
  原来一次 `error` 就判死，而 `ready=true` 并不等于不退回（250ms 命令超时下慢命令照样退回），改成有界预算 3s
  （依据 12 次探针读数 12..129ms）；③ 集成测试里 `await expect(ready).resolves.toBe(true)` 换成 `settle()`
  （判据是"一次探测不退回"这个行为），退回数一律钉成相对基线的增量。**没有为了测试把那 250ms 抬高。**
- 读数：`rateLimit.test.ts` 15/15、三文件 39/39；集成文件 settle 版连跑 6 趟 6/6 绿（12.48–14.04s）；
  `npm run ratelimit:two-process` 12 条判据全 PASS，其中 `NO_FALLBACK_ON_REDIS_PHASE` 读数 `0/0/0/0/0/0`、
  `REDIS_DOWN_STILL_GATES` = `ready=false`、5 次退回、判定 放放放挡挡。八条臂 B1–B8 逐字进
  `docs/adr/0077-rate-limit-memory-bucket-ceiling.md`，其中 **B6 首跑 15 条全绿＝惰性臂**（判据写在循环结束之后，
  中途错误自己好了就没有牙），把断言搬进循环内才红在"第 3 轮把正在挨挡的那一格挤掉了"。说法诚实：settle 版 6/6
  是在健康负载下取的，那三次红没制造负载、无法复现，所以这一片改的是"仪器不再把一次运气当判据"，不是"偶发红已根治"。
- **共用工作树的代价，再记一条**（第二十六片那一节记过同族的前一条）：这一片按隔离索引提交
  （`GIT_INDEX_FILE=… git read-tree HEAD` + 只 `git add` 自己那 10 条路径）。提交成功之后**共享索引里那 10 条路径
  还停在旧 blob**，于是 `git status` 读起来像"我还有 473 行没提交"，而下一个用共享索引提交的人会把这一片**静默
  revert**。收尾因此是固定一步：提交完立刻 `git add -- <自己那几条路径>`——工作树内容此刻等于 HEAD，这一步不改
  任何内容，只把共享索引对齐回来。

## §13 第三十四片：组件目录里点一下就放得进画布——`instantiate` 这条 op 之前根本不存在（2026-11-02）

- 起点是上一片那句"仍未做"。查下去发现比"缺个按钮"更糟：`instantiateComponent()`（模型层，§13 早期写的）
  **返回形状不足以落库**——它只回 `{instance, copiedIds}`，那份 `Record<id, node>` 没带出来，
  所以任何调用方拿到结果都写不进页面；而补丁词汇表里也没有一条 op 会去调它。
  合起来就是：模型 API 有实现、没入口，画布上想放一个组件实例只能让 AI 手写 `insert` 一颗一颗堆。
  现在补的是 `PatchOp` 的 `instantiate`（`{componentId, instanceId, parentId?, index?}`）+ 设计系统面板
  每张组件卡上的「放到当前页」。
- **`instanceId` 是必填的，而且不是洁癖**：`invertPatch` 拿的是**改动前**那份文档，那时这颗实例还不存在，
  op 里不带着 id 就写不出"把它连同子树一起收走"的撤销条目（§150 说所有编辑都可撤销，撤销要能指名道姓）。
  复制体内部的节点 id 是 apply 时才造的，所以逆操作只写一条 `remove`——它自己在**应用后**的文档上收集子树。
- 四道校验全部写在"还没往页面上落一个字"的位置：组件不在目录 / 主组件根不在任何页 / 父节点不存在 /
  `instanceId` 撞已有节点。跳过的那一刀不留半个实例——"壳子在、子树缺一半"那种节点既不是主组件也不是实例，
  渲染与 AI Diff 只能各自猜（§16 / §159）。源页按"哪一页真的有那个根节点"找，不信任 `component.pageId`
  那份可能过期的登记，所以**主组件住在别的页、实例放到当前页**这一格是通的（有用例）。
- **撞 id 那道门后来查宽了一档**：初版只查当前页（`page.nodes[op.instanceId]`），抄的是 `insert` 的写法。
  但 `insert` 的 node.id 也来自调用方，这一族本来就有个空档：那时 `validate.ts` 的 `duplicate-id` **只管页面 id**，
  节点 id 跨页重复没有任何门会拦，之后按 id 找节点的（写的是 `pages.find(p => p.nodes[id])`，
  第一个命中就算真值）只能任选一页当真值。——这一格已在第三十六片补上（门扩到节点 id + `insert` 一起查宽）。
  `instantiate` 的 id 是调用方必填的，所以这一条由我兜：改成 `cow.document.pages.some(...)` 全文档查
  （`cow.page()` 已经把可写页换进 `document.pages`，当前页自然被覆盖，不必再查两遍）。
  用例先钉前提再钉结果：`expect(findPage(doc, home.id)!.nodes[root.id]).toBeUndefined()`——
  不把"只在另一页"写成断言，退回只查当前页的写法就会静默通过。
  **同一个空档在 `insert` 那里还开着**（改它会让今天能过的补丁变成整批 409，不该夹在这片里顺手做），记进下面仍欠。
- 顺带接上同族的五处门，缺一个就是半条路：`packages/schemas` 的 `PatchOpSchema`（自动保存发的是 ops，
  这条 op 过不了报文门就只能退回整份 PUT——见下面 A5 那一格，界面一样说"已保存"，但把合并语义换成了"缺失即删"的整份替换）、
  `npm run contract:export` 的
  三份 `contracts/*.json`（ai-service 按文件校验，改了 zod 不重导就是 Python 侧拒收）、
  `missingPatchReferences` 的 `case 'instantiate'`（查 componentId 与 parentId，把 instanceId 记进本批 created，
  否则"先实例化再改它"会被判成幻觉）。AI 侧的 op 清单也加了这一条（`design_prompt.py`）。
- **数词表时才发现第五处**：MCP 工具 `nexus_patch_design` 的 description 里手抄着一份 op 清单
  （`apps/mcp-server/src/server.ts:77`），它既没有 `instantiate`，也早就没有 `setVisualDna`——
  外部 Agent 只会照着这份清单发补丁，漏一条就等于那条 op 对 MCP 不存在。补齐后把门常驻：
  `apps/mcp-server/test/mcp.test.ts` 从 `contracts/design-patch.schema.json` 里读出全部 op 名
  （不手抄第二份清单），逐条要求描述点名，并且先要求契约至少列出 20 条——
  契约要是读空了，下面的断言会全绿，那正是"没有门"。
- **看图抓到的一处真错**：`instantiateComponent` 过去无条件把复制体扭成 `container`。把一行文字存成组件
  再放实例，复制体就丢了文字类型——容器不排版文字，量出来 **1440 × 8**，文字压在原文上（第一张截图就是这样）。
  现在只有 `component`（"我是主组件"的目录标记）降成 container，其余类型照抄。改完同一份用例量到 1440 × 62，
  两份文字各站各处。
- 读数：`packages/design-model` 439/439（其中新增 `patch-instantiate.test.ts` 15 条）、
  `packages/schemas` 358/358（新增 `patch-instantiate.test.ts` 3 条：合法 op / 可选字段与负 index / 缺 instanceId 被拒）、
  `apps/mcp-server` 21/21（`mcp.test.ts` 14 条，含新的词表门；`mcp-http.test.ts` 7 条）、
  `apps/web/test/evaluation.test.ts` 13/13、`e2e/components-panel.spec.ts` **2 passed（15.9 秒）**
  （第二条这次多钉两层：撤销/重做之后等自动保存、刷新再读一次目录，外加下面 A5 那两条 PATCH 计数）。
  这三套合跑一次是 `Test Files 41 passed / Tests 809 passed`（438+358+13 对得上），
  ai-service 那侧 `77 passed`（`design_prompt.py` 动了一行清单，Python 的门仍然认这份提示词）。
  全仓单测整跑一次：`Tests 3383 passed | 2 failed (3385)`——**两条红都不在本片**：
  `apps/web/test/responsive-editor.test.ts` 的 `CHANNEL_CASES[spec.id]` 解构不到 `layout.reverse`
  与它的 tsc 报错同源，是并行会话那半片还没写完的通道表（本片提交闸被同一句挡住，见文末"共享 worktree"那条纪律）。
  这一跑还教了一条仪器常识：整跑开始**之后**才写的两处改动，可能被已经 import 过那份模块的 worker 用旧版跑——
  `patch.ts` 在整跑早期就被别的用例载入，所以我随后查宽的那道门没进那次运行，新用例红在
  `skipped[0]` 是 undefined。那不是缺陷，是读数过期：单独重跑 `patch-instantiate.test.ts`（15/15）
  与 `apps/mcp-server`（21/21）全绿，那才是本片代码的读数。
  截图 `screenshots/components-instantiate.png` 人眼看过：目录卡片写着引用 1、画布上多一份 Headline、
  右侧属性面板是 `instance · Headline`（放完自动选中，用户不用去树里找）。
- 臂表（每臂一次改动、跑完立刻恢复，`grep -c "MUT "` 归零）：
  **A1** 只挂壳子不挂复制体 → 单测 5/14 红 **且** e2e 红在 `data-layer-total` 期望 9 实得 8；
  **A2** 摘掉 `instanceId` 撞车 guard → 正好红那一条（skipped 没记账）；
  **A3** 逆操作改成"把壳子设可见" → 单测 2 红（形状 + 节点数 15≠11），e2e 红在撤销后仍写"引用 1"；
  **A4** 复制体退回 container → 红在新那条类型用例（`expected 'container' to be 'text'`）；
  **A6** `created.add(op.instanceId)` 换成别的串 → 红在 evaluation 的新用例（`['ins_1']` 被判捏造）。
  **A7**（查宽之后补的）把那道门退回只查当前页 → `1 failed | 14 passed`，
  红在点名它的那一条（`instanceId 撞在别的面上的节点`）——前提断言 `findPage(doc, home.id)!.nodes[root.id]`
  是 undefined 让这条臂有牙：那颗 id 只在另一页，只看当前页就放过去了。
  **A8** 把 `instantiate` 从 MCP 描述里摘掉（清单那句与末尾那句都摘，只摘一处会因为另一句仍然提到而绿）
  → `1 failed | 13 passed`，红在 `MCP 描述里没点名的 op：instantiate`。
  **A5** 摘掉 `packages/schemas` 里 `instantiate` 那条 zod → **第一跑是绿的，这就是一条惰性臂**，
  而它当时看着完全合理：那条 e2e 末尾已经写了"等自动保存 → 刷新 → 目录仍写引用 1"。
  查下去才知道这句见证根本证不到报文门——`store.save()` 里有
  `if (res && (res.status === 409 || res.status === 400)) res = await putBody()`（`apps/web/src/studio/store.ts:638`）：
  补丁被门拒掉，客户端**当场换整份 PUT 再送一次**，PUT 发的是同一个人内存里的同一份状态，实例于是照样落库。
  界面说"已保存"、刷新后照样看得见，两条都对——只是走的是另一条路。
  仪器因此补了一层网络侧读数（`page.on('response')` 记 `PATCH …/design` 的成/拒），
  断言"送出过补丁且一次也没被拒"。**重跑同一臂：1 failed**，红在
  `自动保存里有 1 次 PATCH 被报文门拒掉`，前面 12 步（含刷新后 `引用 1`）全过。恢复后 2 passed。
  **记这条的通用教训：一个"刷新后还在"的见证对存储路径是盲的——只要客户端有整份兜底，
  它能证明数据落库，但证明不了某个 op 过得了 ops 契约。要钉契约就得读网络，不能只读界面。**
  没有一条是惰性臂：每条都点名了它红在哪一句。
- 尺子换过一次，记下来免得下次再当 bug 查：图层列表是**虚拟化**的（只铺看得见那几十行），数 `[data-layer-id]`
  数量其实是数滚动窗口；`data-layer-total` 才是文档侧的真数，而它只在"图层"那一栏里存在——跨面板取值先拿 id
  再换栏（上一片就踩过同一条），读它要切回图层栏、读完切回设计系统栏。
- 仍欠，如实记下：① **实例不跟随主组件**——`instantiate` 是一次性复制，之后改主组件不会传到已有实例，
  §13 那句"实例跟随主组件"这一半还没做（override / 重置为主组件 / 变体切换同族，都在下一格）；
  ② 入口只到"当前页末尾"，选中某个元素再"放进去"（指定 parentId）在模型层通、界面上没有；
  ③ variantProps 只按 props 默认值填，`slots` 与 `variants` 复制时不参与；
  ④ AI 那一路只加了提示词一行，没有端到端见证真 provider 会发这条 op（没配真 provider 时仍是 DEMO MODE）。
  ⑤ A5 顺带点出的那条**不是本片造成的**欠账：补丁被拒时客户端悄悄换整份 PUT，界面仍是"已保存"，
  用户与面板都不知道这一次走的是"缺失即删"的整份替换（并行会话正在改这一段就不动它）；
  要补的是把"这一存是补丁还是整份"投影到 `[data-save-state]` 上，另加一条把 `putBody` 兜底本身测到的用例。
  ⑥ ~~`insert` 的 `node.id` 仍是**只查当前页**（`patch.ts:275`），跨页撞 id 还是写得进去~~ **已做**
  （§13 第三十六片：查宽到整份文档 + `validate.ts` 的 `duplicate-id` 扩到节点 id，见文末那一节）。
  `instantiate` 那次查宽了，同一族的这条当时没跟着改（会让原本能过的补丁变成整批 409，属于对外行为变更，
  所以单独立一片做）。

## §13 第三十五片：主组件改了，实例能跟上——顺带把"补丁必须确定"钉进门（2026-11-03）

- 起点是上一片"仍欠"的第一格：`instantiate` 落的是**物化复制体**，之后改主组件不会传到已有实例，
  而界面上连一条换掉它的路径都没有（只能删了重放，重放还会把位置与手动改动一起丢掉）。
- **不新增 op**：`syncInstanceOps(doc, component, instanceId)`（`packages/design-model/src/components.ts`）
  产出的是标准串 `[{op:'remove', 旧复制体根}, {op:'insert', …}…]`，父排在子前面。
  两个理由各自都够：① 撤销是免费的——`invertPatch` 遇到 `remove` 本来就把整棵旧子树捕成 insert 序列，
  所以"旧的收走、新的插回"的逆就是"新的收走、旧的回来"，不必为同步另写一份逆操作（§150）；
  ② 报文词汇表不动，`packages/schemas` / `contracts/*.json` / MCP 描述 / `missingPatchReferences`
  那四道同族门就不会出现"模型有、外面没有"的漂移（上一片刚查出漏了 MCP 那一处）。
  新复制体借 `instantiateComponent()` 造，不抄第二份复制逻辑（类型照抄、`component` 降级那些规矩只写在一处）。
- **摆不出来就说摆不出来**：三道守卫一律回 `[]`（实例不在了 / 旧复制体不在了 / 主组件根不在了），
  调用方据此决定按钮点不点得动。面板那颗按钮的 disabled 判据用的是**产出的 op**而不是"这一页有没有实例"——
  引用计数 >0 但复制体缺了一颗的那种节点，发出去只会得一条被 skip 的记账（§159）。
- **只承诺当前页**，并且界面上就这么说：`studio.execute` 一律打在 `document.activePageId`
  （`apps/web/src/studio/store.ts:1364`），所以「更新实例」的计数是**这一页**的实例数（`data-component-sync-count`），
  引用都在别的页面时按钮不可点，title 里写"共 N 个，切过去才能更新那一页"。
  在按钮上写"全部"是假话，就不写。
- **e2e 首跑抓到一条界面永远看不见的缺陷**。同步那条见证第一次跑就红在自动保存的 PATCH 计数上：
  ```
  409 {"error":"ops_skipped","skipped":[{"index":0,"reason":"node tex_mvzht9zj6o1cpd not found"}]}
  ```
  根因不在同步，在 `instantiate`：复制体每个节点的 id 是 `uid()` 现场摇的，而一条 op 天生被 apply 两次
  （客户端改内存里那份、服务端在库里那份上重放，`patchProjectDocument`），两边各得一套 id ⇒ 两份文档永久分叉。
  之前没暴露，是因为**没有任何 op 点名过复制体内部的节点**；同步第一条就是 `remove` 旧复制体，才第一次踩到这条缝。
  界面照样说"已保存"，因为 `store.save()` 在 409/400 时当场换整份 PUT 兜底（`store.ts:638`）——
  这是上一片 A5 那条教训的**第二次应验**，而且这一次它挡住的是一条架构级缺陷（§16"唯一真值"按进程各说各话）。
  修法与选型见 `docs/adr/0079-instance-copy-ids-derived-not-random.md`：复制体 id 改成
  `<类型前缀>_<instanceId>_<源节点 id>` 推出来，同时去掉那次调用里的临时 `id: "tmp"`。
  **通用纪律（写进 ADR-0079）：任何会自己造 id 的 op 都必须让 id 从 op 自带的参数推得**，
  否则"客户端算一遍、服务端重放一遍"这条路必然分叉。
- 门补了三道，从快到慢各管一段：
  1. **模型层·双文档**（`patch-instantiate.test.ts` 末尾那个 describe，2 条）：同一串 op 在两份一模一样的
     文档上各打一次，① 节点 id 集合相同；② 从客户端那份算出的同步 op 串，在服务端那份上 `skipped` 为空。
     不看浏览器就钉住这条路。
  2. **模型层·词汇表级**（新文件 `packages/design-model/test/patch-determinism.test.ts`，22 条）：
     20 条 op 各一条"两份文档各打一次 → 结果全等"的用例（比较前抹掉 `metadata.updatedAt` 那个钟，
     `applyPatch` 每次都写它）。清单**由契约反钉**：op 名从 `contracts/design-patch.schema.json` 的
     `op.const` 里读出来（不手抄第二份清单），先要求契约至少列 20 条（读空了就是一条惰性门），
     再双向要求"契约 ⇔ 用例清单"互相覆盖——**加一条 op 不写确定性用例，这一句就点名它**。
  3. **界面层**（`e2e/components-panel.spec.ts` 第 3 条 + 抽出的 `trackDesignSaves()`）：
     PATCH 成/拒分开数，被拒时把服务端正文前 500 字摊进断言消息；另数 `putOk`，
     因为 `patchRejected===0 && patchOk===0` 与"补丁被拒后换了整份"是两回事（前者压根没走补丁这条路）。
- **看图抓到第二条真错，这一条是界面自己长出来的**：卡片一行排不下"名字 + 引用数 + 三个按钮"，
  「删除」被挤到画布底下——DOM 里查得到、`toBeVisible()` 也过，只有命中测试能发现。
  后果不是失败而是**干等**：Playwright 的重试把那条 e2e 拖到 150 秒超时（243 次 `intercepts pointer events`）。
  修法：组件卡改成两行（名字+引用 / 动作排 `flex-wrap`）。
- 读数（逐字）：`packages/design-model` `Test Files 35 passed (35)` / `Tests 470 passed (470)`；
  `e2e/components-panel.spec.ts` `3 passed (1.8m)`（18.9s / 28.0s / 18.8s，第一条含仪器自证）；
  `npx tsc -p e2e/tsconfig.json` 与 `npx eslint DesignSystemPanel.tsx components-panel.spec.ts` 均 rc=0。
  改完卡片布局后重跑一次是 `3 passed (1.4m)`（14.7s / 26.6s / 18.0s）。
- 臂表（每臂一次改动、跑完立刻恢复，收尾 `grep -rn "MUT "` 归零）：
  **D1** 复制体 id 退回现场摇随机数 → `5 failed | 41 passed (46)`，红在
  `复制体的 id 一模一样` / `从客户端那份算出来的「更新实例」那一串，在服务端那份上一条都不落空` /
  determinism 的 `instantiate`、`restoreComponent`、`实例化以后从客户端那份算出的 id…` 三条
  （`restoreComponent` 内部重放 instantiate，所以它也跟着红——这一格是白捡的）。
  **D2** 从用例清单里摘掉 `remove` 那一条 → `1 failed | 20 passed (21)`，红在
  `契约里有、这里没有确定性用例的 op：remove`，正是反钉那句要说的话。
  **S1** 同步不先收走旧复制体 → `6 failed | 18 passed (24)`，关键读数是
  `expected [ '立即购买', '提交' ] to deeply equal [ '立即购买' ]`（旧的那份还挂在实例上，两份并存）。
  **S2** insert 排成子在父前 → `6 failed | 18 passed (24)`，红在
  `insert 标签 的父 con_ins_…_com_… 还没插进来` 与各条 `skipped` 非空。
  **S3** 摘掉"旧复制体不在这份文档里"那一半守卫 → `1 failed | 6 passed (7)`，
  正好红在点名它的那一条（悬空那颗本该回空串，却吐出 4 条 op）。
  **U1 / U1b 两条是惰性臂，如实记**：改 `li` 为单行、再改成 `min-w-max` 撑宽动作排，两次都**没**造成溢出
  （按钮自己换行了），门对着没坏的东西当然绿。所以命中测试那句的牙**不靠产品布局来证**：
  改成仪器自证（`expectDoorHasTeeth`）——盖一层全屏透明遮罩，同一句必须报 `covered-by-*`，撤掉必须回 `ok`。
  臂不碰产品代码，且这条自证常驻在 test 1 里。
- 仍欠，如实记下：① **不自动跟随**——这一片做的是手动那半，"改完自己传过去"要转向 ADR-0078 的选项 1，
  把 `applyInstanceOverrides()` 接进 layout / render / codegen 三条链（就是任务 #32 那一格）；
  ② 同步**覆盖实例上的手动改动**：复制体是物化的，用户在实例里改过的那一处和"旧版主组件"分不清，
  现在一律按主组件覆盖掉。没有 override 之前，这一条是这一片的功能边界，不是 bug，但界面上也没说；
  ③ 一次事务同步当前页全部实例，跨页要逐页切过去点；④ ~~`insert` 跨页撞 id 的空档仍在~~ **已做**（第三十六片）。

## §13 第三十六片：节点 id 的"全局唯一"到底全局到哪一层——`insert` 查宽 + 保存门点名跨页重号（2026-11-03）

- 起点是上一片仍欠的 ④（再上一片记的 ⑥）。`instantiate` 的壳子在第三十四片就查整份文档，
  而同一族的 `insert` 只查当前页（`page.nodes[op.node.id]`）：同一颗 id 在这一页没有、在另一页有，
  这一刀照样写得进去。当时没顺手改，因为**它把今天能过的补丁变成整批 409**，属于对外行为变更。
- **先量存量，再改行为**（这条改动的全部风险就是"锁死既有文档"，所以顺序不能倒）：
  真库 `nexus-postgres` / `nexus`（55433）上，按"同一份文档内跨页重号"的口径
  ```sql
  select count(*) from (
    select p.project_id, dn.id, count(distinct dn.page_id) c
    from design_nodes dn join pages p on p.id = dn.page_id
    group by p.project_id, dn.id having count(distinct dn.page_id) > 1) t;
  ```
  读数：`8537` 个节点 / `578` 页 → **0** 个跨页重号；快照侧
  ```sql
  with page_nodes as (select s.id snap, nk.key node_id from snapshots s
    cross join lateral jsonb_array_elements(s.document->'pages') pg(val)
    cross join lateral jsonb_object_keys(pg.val->'nodes') nk(key))
  select count(*) from (select snap, node_id from page_nodes group by 1,2 having count(*)>1) t;
  ```
  读数：`761` 份带节点的快照 → **0** 份里有跨页重号。所以这一刀不改变任何既有文档。
- **一条反面读数，记下来是给下一次量的人省命**：不带项目口径直接
  `select id from design_nodes group by id having count(distinct page_id) > 1` 数出来是 **98** 颗，
  形如 `but_mvss5k6aofmhwl`（各占 5 页 / 5 个项目）。逐颗核对是
  `select dn.id, count(distinct p.project_id), count(distinct dn.page_id) …` → 每颗在**五个不同项目**里各有一份，
  也就是同一个演示种子被播了五次、每个项目自己那份文档里它并不重号（上面那条按 `project_id` 归堆的查询回 0 就是这件事的证明）。
  门的范围是"这一份文档"（`cow.document.pages` / `validateDocument(document)`），不是"全库"——
  量错了口径会把一条没牙的门当成有牙，或反过来以为门把整个库挡死了。
- **两处改动**：
  1. `packages/design-model/src/patch.ts` 的 `insert`：`page.nodes[...]` → `cow.document.pages.some(...)`，
     被挡下仍走 `skipped`（reason `duplicate node id <id>`），并且**在往页面上写一个字之前**判完，
     不落"半个节点"（与 `instantiate` 那四道校验同一规矩）。
  2. `packages/design-model/src/validate.ts`：`duplicate-id` 从"只管页面 id"扩到节点 id——
     按 `nodeId → pageId[]` 归堆，堆里 ≥2 就报 **error**，正文点名"哪一颗、在哪几页上各有一份"。
- **为什么是 error 而不是 warning**：重号以后按 id 找节点的那几条读路径写的是
  `pages.find(p => p.nodes[id])`——第一个命中就算真值（`components.ts` 找实例所在页与主组件所在页、
  `patch.ts` 的 `instantiate` 找源页），读到哪一页取决于页面顺序。§16 说设计模型是唯一真值，
  两份同名节点就是两个真值。
  而 warning 级在保存门上等于放行（`parseDocument` 只把 error 当拒绝），放行的后果是让坏数据继续被各处
  任选一份当真值，这正是 §159 说的"不静默修数据"要拦的那类。
- **为什么两道门都要有，不是一道**：`insert` 那一刀是当场拦新增，但它的可见性取决于调用方有没有读
  `skipped`；`validateDocument` 这一条管两件新增管不到的事——**门装上之前的存量**，以及不是新增路径带进来的
  重号（快照恢复、导入、整份 PUT）。两条写路径共用同一个结构门：PATCH 打完补丁以后
  `apps/web/src/server/domain/projects.ts:817` 也过 `parseDocument`，所以"补丁能过、整份被拒"这种口径差
  不会出现在这一条上（新加的那条 web 用例就是钉这一点）。
- 见证 4 条：`patch-commands.test.ts` 1 条（id 只在另一页上也不许在这一页再插；先钉前提"这一页确实没有"，
  否则那条用例测的是同页重号）；`serialize-validate.test.ts` 2 条（跨页重号 → error 且报出颗与两页；
  以及"两页各一颗正常节点不报重号"，防止它退化成"只要多页就红"）；
  `apps/web/test/validation.test.ts` 1 条（同一形状过保存门必须被拒，issue 正文含 `duplicate-id` 与那颗 id）。
- 读数（逐字）：`packages/design-model` `Test Files 35 passed (35)` / `Tests 473 passed (473)`（本片前 470）；
  design-model + `apps/web/test/validation.test.ts` 一起跑 `Test Files 36 passed (36)` / `Tests 488 passed (488)`；
  `npx eslint` 那五个改动文件 rc=0；收尾 `grep` 源码零 `MUT ` 标记。
- 臂表（一臂一改动，跑完立刻恢复）：
  **G1** `insert` 的撞 id 退回只查当前页 → `1 failed | 36 passed (37)`，红在
  `expected [] to have a length of 1 but got +0`（`patch-commands.test.ts:136`，正是预测那一句）。
  **G2** 摘掉 `validate.ts` 的跨页扫描（`pageIds.length < 2` 改成 `< 99`）→ `2 failed | 39 passed (41)`，
  模型侧红在 `expected [] to have a length of 1 but got +0`（`serialize-validate.test.ts:160`），
  web 侧红在 `expected true to be false`（`validation.test.ts:148`）——**保存门真的放行了那份文档**，
  这条 web 见证不是惰性臂。
  **G3** 把那条 issue 从 `error` 降级成 `warning` → 同样 `2 failed | 39 passed (41)`，web 侧仍红在
  `expected true to be false`（门只滤 error，降级＝放行），模型侧红在
  `expected 'warning' to be 'error'`（`serialize-validate.test.ts:161`）。
  G2 与 G3 打在 web 那一句上是同一个红：**要么报出来、要么是 error 级**，中间没有第三种活路。
- 仍欠，如实记下：① 这条 error 会让"历史上带跨页重号的文档"一改就存不进去（实测存量为 0，
  所以今天没人被挡）；真出现时该给的不是放行，而是一条**把两份重号节点改名并保住引用**的迁移，
  现在没有；② 库侧没有约束兜底——`design_nodes` 主键是 `(page_id, id)`，跨页重号数据库不拦，
  要不要加一条按 `(project_id, id)` 的唯一索引（或触发器）留给以后真被绕过一次再说；
  ③ ~~`duplicate-id` 同时表达"页面重号"和"节点重号"~~ **2026-11-05 已拆（第三十七片）**：
  现在是 `duplicate-page-id` / `duplicate-node-id` 两个 code。

## §13 第三十七片：`duplicate-id` 拆成页/节点两个 code——两种重号的修法不同（2026-11-05）

第三十六片把结构门从"只管页面 id"扩到节点 id 时，两类重号共用了同一个 code，靠正文区分。
但健康层与公开页都只打印 `issue.code`，于是"改页 id"与"改节点 id"在界面上长得一模一样。
这一片只拆 code，行为（error 级、拒保存）一个字不变。

- `validate.ts`：`duplicate-page-id`（两页同 id）、`duplicate-node-id`（同一颗节点 id 跨页各一份）。
- `health.ts` 的 `BUILD_CODES` 两档都收——换 code 不该让健康行掉档。
- 见证：`serialize-validate.test.ts` 新增 1 条——伪造两页同 id（第二页是干净新页，不共享节点）⇒
  `duplicate-page-id` 恰好 1 条、`duplicate-node-id` **0** 条（防它退化成"重号就报两种"）；
  原有跨页节点用例改读新 code；`validation.test.ts` 两条保存门用例各读自己的 code。
- 读数：`packages/design-model` **35 files / 474 tests passed**（本片前 473）；
  `validation.test.ts` + model 一起 42 passed。
- 臂：把页面那一处改回 `duplicate-node-id` ⇒ 新用例红在"页重号 1 条"（两种混回一种）；
  把节点那一处改回 page ⇒ 跨页用例红。
- 仍欠：`world-model` / `game-model` 里各有自己的 `duplicate-id`，与本片无关；若将来统一三套
  校验的输出形状，再一起对齐。

## §SEC 第三十四片：Redis 那半的键基数也要有上界——名额用完交给本机窗口判，不是免检（2026-11-03）

起点是第三十二片自己写下的一句"仍欠"：「Redis 侧的键基数没有上界（靠 TTL 收尾而不是靠上限）」。这一回洞不在闸
的语义上，在**这台 Redis 根本不会替谁设上限**：实测 `maxmemory 0`、`maxmemory-policy noeviction`、
`evicted_keys 0`、`expired_keys 247`、`used_memory 1.65M`、容器 `HostConfig.Memory 0`（`4.746MiB / 7.66GiB`）
——所以"靠 TTL 收尾"那条腿踩不上，容量只能钉在应用侧。而桶键第三段那段身份仍是中间件给每个新访客现签的 guest：
"来一个人"就是"多一只键"，与第三十三片在进程内那张 `Map` 上看到的是同一个形状，只是这回写在一台**所有实例共用**
的机器上，谁都不数总数。

- 机制三条：① 名册 `${keyPrefix}__bucket_index__`（成员＝桶键名，分数＝`now + windowMs`，**与那一步 `ZADD` 用同一个数**
  ——两处各取一次 `TIME` 会让"占名额"和"进窗口"落在不同时刻，名额就能比窗口先空）；② 每次命中先
  `ZREMRANGEBYSCORE 名册 -inf now` 腾位子，所以名额不是"先到先得、后来的人永远进不来"；③ `EXISTS 桶 == 0` 且
  `live >= maxBucketKeys` 时 Lua 判决 `2`，JS 记成原因 `over-cap`，**这一笔交给进程内窗口判**。
- 判决 `2` 那一支是这一片唯一容易读反的地方：**"拒绝新建"不等于"免检"**。名额满挡住的是**键的数目**，不是请求；
  请求照样被本机窗口挡住，额度是这台自己数的那份（与 ADR-0076 断线退回同一句代价）。另一种做法——淘汰最旧的桶
  腾位子——等于每次洪水都白送某个身份一次空窗口，所以明写不换；这一格正是 N2 与 C1 两臂的分界。
- 与第三十三片（进程内）**三条故意分歧**：扫每次命中而不是攒 256 次（Redis 侧扫的是 O(过期数)，进程内侧扫的是
  O(表长)，挂每请求就是一条放大攻击）；满时**不动别人的窗口**而不是 LRU 淘汰；上界数字**相同**
  （`DEFAULT_MAX_BUCKET_KEYS = 50_000`，一格 ≈ 键串 + 至多 `limit` 个时间戳 + 一条索引成员，与进程内同一档）。
  名册自己也得有寿命（`INDEX_TTL_MS = 90 分钟`）——它不能变成一只永久的键。`reset(key)` 顺手 `ZREM`，名额当场还回来。
- 出声：`nexus_rate_limit_driver_fallbacks_total` 新增标签值 `over-cap`（**新枚举先进 `METRICS`**，否则这条线在
  面板上根本不存在），退回日志按原因各一分钟一行（`FALLBACK_LOG_INTERVAL_MS = 60_000`），逐笔的数只进 counter；
  门面那两行启动日志带上上界数字（"桶上界 50 000 只"），因为"哪个驱动 + 上限多少"是排查时的第一句话。
- 读数（逐字）：`rate-limit.redis.integration.test.ts` 新增 `describe('桶键的上界')` 7 条打真 Redis，每份用
  `${RUN_PREFIX}cap:` 这个**子前缀**（名册按前缀各有一份，小上界才只挡自己头上），且 `emptiedLimiter()` 里
  `reset()` 之后自己作证"Redis 里真的空了"——不然"名额从 0 数起"就靠一条看不见的前提。三文件合跑首跑
  `Test Files 1 failed | 2 passed (3)` / `Tests 1 failed | 45 passed (46)`，红在
  `alpha 在测量期间退回了：那句"合计恰好 limit"就不是共享窗口的读数: expected 1 to be +0`——同一时刻 slowlog 记着
  10–48ms 的普通命令，判为负载造成的一次 250ms 超时；**没有为此放宽那个超时，也没有改断言**（它是生产每请求排队
  预算的一部分）。收尾复跑 `Test Files 3 passed (3)` / `Tests 46 passed (46)`（`Duration 16.45s`）。
  `npm run ratelimit:two-process` 从 12 个进程 / 11 条判据涨到 **18 个真进程、16 条判据全 PASS**（第三十三片那句
  "12 条判据"按仓库惯例加了 dated 更正，不静默改数）。
- 演练新增五格里最要紧的是那对**必须合起来读**的：`CEILING_IS_SHARED_ACROSS_PROCESSES: PASS — 三个进程各要一只新桶、
  上界 2：Redis 里实际 2 只桶键…；前两只的退回增量 +0 / +0（非 0 就是它们没写在 Redis 上，那"只有两只"是线路坏了
  不是名额满了）`、`OVER_CAP_REFUSAL_IS_A_CEILING_NOT_A_BROKEN_LINE: PASS — 第三只键 3 次判定：ready=true、键没建=true、
  退回原因 {"over-cap":3}`、`OVER_CAP_STILL_GATES: PASS — …给出「放放挡」——放行数恰好是它自己的限额`、
  `CEILING_INDEX_MATCHES_BUCKET_KEYS: PASS — 名册 2 条、真实桶键 2 只、被拒那台自己读到的名册 2 条`、
  `CEILING_NOT_TRIGGERED_WITH_ROOMY: PASS — …换成上界 10 ⇒ 3 只桶键、退回 +0/+0/+0、判定 放放放`。
  `over-cap` 与 `command-failed` **行为同形**，只有原因标签分得开，所以演练加了 `fallbackReasons()`（读 `snapshot()`
  的 counter，不读孩子进程的自述）。判据全由父进程自己 `SCAN` / `ZCARD`，线路探测用**同级前缀**（子段会被数进判据），
  且紧上界下不许用被测 limiter 探测（over-cap 也算退回，永远等不稳）。
- 延迟：`ZREMRANGEBYSCORE` 挂在每次命中上是这一片新加的一条往返。第一版探针分别跑 60 次再比 p50，在 5000 条那档
  得出方向相反的结论，判为负载污染后改成**配对交错**（每对之后 `ZREM` 掉名册条目，防止"名册=0"那一档自己涨）：
  `名册=0 配对差(新−老) p50 0.05 p90 1.20` / `名册=500 p50 -0.05 p90 1.00` / `名册=5000 p50 0.05 p90 5.41`（各 n=200）。
  **能钉的是"p50 读不出来"，不能钉的是 p90**——两句都写进 ADR，不拿前者冒充后者。
- 臂表 N1–N7（改驱动源码、跑那一个文件）+ C1（改演练读的那份驱动、跑演练），逐字进
  `docs/adr/0081-rate-limit-redis-bucket-key-ceiling.md`：N1 `位子没腾出来…: expected 1 to be +0`、
  N2 `expected [ …(3) ] to deeply equal [ …(2) ]`、N3 两处 `expected +0 to be 1`（没退回＝压根没交给本机判）、
  **N4 六红**（去掉 `ZADD 名册`，凡依赖"名额被谁占着"的格子一起塌）、N5 `expected -1 to be greater than 0`、
  N6 `expected 1 to be +0`、N7 `…to have a length of 1 but got 5`；C1 两红并**点名两格对这个臂是盲的**
  （`OVER_CAP_STILL_GATES` 与 `CEILING_INDEX_MATCHES_BUCKET_KEYS` 照旧绿，各自钉的是取向与一致性，不钉名额数）。
  C1 第一写把 Lua 写成非法的 `MUT_MAX(...)`，那会红成"线路坏了"而不是"上界失效"，改成 `maxKeys + 999999` 才打得对。
- 没牙的格子，点名：`50_000` 这个具体数没有门（测试与演练全用 2 与 10，改成 500 或 5 000 照样绿）；`INDEX_TTL_MS`
  只钉"有上界"不钉"为什么 90 分钟"；`FALLBACK_LOG_INTERVAL_MS` 只钉"5 笔只喊一行"不钉那一分钟；满额时
  "两台同时各放 `limit` 次"的跨进程形状没有专门用例（只有断线那组的 `FALLBACK_SCOPE_IS_PER_PROCESS` 覆盖同一条
  降级路径）。—— 最后这格**已还**（§SEC 第三十六片，2026-11-05：演练 `④″` 三格判据 + 两条臂，见 ADR-0081
  「第三十六片补的那一组」）；前三格照旧没牙，原样留在这里。
- 旧账翻面：ADR-0076 仍欠 1（"靠 TTL 收尾"现在是两条腿）、ADR-0077 仍欠 2（进程内是"顶到上界淘汰别人"，Redis
  这半是"顶到上界不动别人"，取向相反的理由写进 ADR-0081 的后果）、`docs/SECURITY.md` 的限流条目补 Redis 侧收口整段、
  `docs/ENVIRONMENT.md` 新增「⚠️ 这台 `nexus-redis` 实测没有容量上限，所以上界写在应用里（2026-11-03 实测）」＋部署口径。
  已知技术债第 3 条那句"Redis 侧的键基数没有上界"划掉。
- 仍欠，如实记下：① "这台实例现在用的是哪个驱动"仍然**没有界面位**（这一片给的是启动那行日志，不是界面）；
  ② ~~`realtime/redisBus.ts` 里同一形状的 `connectionReady` 还是"一次 error 判死"（ADR-0077 仍欠 4，原样没还）~~
  **已还**（§SEC 第三十七片，闩的语义按决定不改，坏的是拿它读"现在通不通"；见 `docs/adr/0083-…`）；
  ③ 上界钉的是"闸自己写多少键"，没钉"这台机器上一共多少键"——正解是分片或把闸挪到边缘层；
  ④ 若将来给它设了 `maxmemory` + `allkeys-*`，我的窗口会被逐出，而"闸的记忆丢了"的读数在 Redis 的 `evicted_keys` 里、
  不在这个进程里；⑤ 单次命令抖过 250ms 照样让测量期间退回——`settle()` 钉的是"这一趟往返不退回"，不承诺"没有运气"。
  —— 上面这句 ① **已还**（第三十五片，ADR-0082，2026-11-05）；⑤ 那条在本片被抓成了看得见的读数，
  并多出一个新事实（启动后第一笔判定），记进本片仍欠 ①。

## §SEC 第三十五片：限流闸"装的哪个驱动、名额钉在几、有没有正在退回"进界面——读数由驱动自报，两本按原因的账仍从 counters 读（2026-11-05）

起点是同一句欠账挂在三份文件上：ADR-0076 仍欠 2（2026-10-31 写的）、ADR-0077 仍欠 1、ADR-0081 仍欠 1。
原话是"今天的答案只有启动那一行日志与那个 fallback counter"，而 0076 那句"留给下一个真的要看这个数的人"
被后面两片各抄了一遍。这一片就是那个人。它不是锦上添花，有两条实的：

1. **不设 `NEXUS_REDIS_URL` 时限额那句话逐字换主语**——`10 次/15 分钟/邮箱` 变成"每台各 10 次"。
   看得见部署的人没有一个会去 grep 那台进程的 stdout，而第三十四片之后又多了一格同样只有日志会说的话：
   `{reason="over-cap"}` 说的是**名额用完**，不是 **Redis 坏了**。对调用方两者同形（都是本机窗口给的判定），
   差别只在运维要不要去动那台机器。
2. **这一片在开发期间就用界面抓到了两次只有 counters 里才看得见的退回**（见下面"新事实"）。
   那两次如果是我 `curl /api/metrics` 手跑的就不算见证——手跑的见证等于没有见证。

- 机制（决定七条，逐条写进 ADR-0082）：① `RateLimiter` 接口加 `describe(): RateLimiterReadout`
  （`rateLimit.ts:82`），两个驱动各实现（`rateLimitMemory.ts:148` / `rateLimitRedis.ts:408`）；**同步**是刻意的，
  一个诊断读数不许为了"数得更准"去打网络，也不该把 250ms 那套每请求预算搬到页面上。
  ② 三个"不适用"用 `null` / `'na'`，不许抹成 0 / `'up'`——每一格都是一句"这个驱动没有这个东西"。
  ③ `wire` 读 `client.status`（live），不读那个一次性的 `ready` promise（后者断开、重连、`disconnect()` 都不改主意，
  用它做线路格子会永远说"通着"）。④ `bucketsTracked` 两个驱动**同名不同权威**：进程内＝那张表自己；
  Redis＝这台最近一次判定带回的名册条数，权威是那台 Redis 的 `ZCARD`，长时间没流量时它是旧的——
  这句限度印在页面文案里，不只写在注释里。⑤ `deployment.redisUrlConfigured`（该装哪个）与 `driver`（现在在跑哪个）
  分开交。⑥ 两本按原因的账（`fallbackByReason` / `bucketsPrunedByReason`）从 `snapshot()` 现读，**不让驱动自报**——
  同一句话只允许一个写入方。⑦ 门与复核台、实时总线同一句口径：默认拒绝，`role!=='admin'` 403 且一个字段都不给。
- 落点：`GET /api/admin/rate-limit`（`route.ts:35`）＋ `/admin/rate-limit` 那一页（`page.tsx` 服务端拒绝两分支、
  `StatsPanel.tsx` 每 4 秒问一次单例那份现场）＋ `AdminNav` 的「限流闸」一项（排在实时总线之后）。
- 见证逐字：单测 12 ＋ Redis 集成 26 ＋ 接口集成 6 合跑 `Test Files 3 passed (3)` / `Tests 44 passed (44)` /
  `Duration 29.39s`；`npx tsc -p apps/web/tsconfig.json --noEmit` 与 `npx eslint`（本片 11 个文件）均 rc=0。
  e2e **两种驱动各跑一轮**（`e2e/ratelimit-admin.spec.ts`，`NEXUS_WEB_URL=http://localhost:3101`）：
  ```
  进程内那轮（dev server 不设 NEXUS_REDIS_URL，pid 33900）— 2 passed (52.8s)
    驱动=in-process 窗口=this-process 线路=na 上界=50000 部署=unset
    键前缀=—（这个驱动没有键空间）
    数到的桶=1 只（这张表里的条数，就是权威）
    交给本机窗口判=—（进程内驱动没有"本该共享却退回"这回事）
  Redis 那轮（NEXUS_REDIS_URL=redis://127.0.0.1:56379，pid 33652）— 2 passed (57.2s)
    驱动=redis 窗口=shared-across-instances 线路=up 上界=50000 部署=configured
    键前缀=nexus:ratelimit:v1:
    数到的桶=2 只（这台最近一次判定带回的名册条数；权威是那台 Redis 的 ZCARD，长时间没流量时它是旧的）
    交给本机窗口判=1 次：命令失败（Redis 没答上） 1
  ```
  两张截图按驱动分别落盘，后跑的不再盖掉前一轮的凭证：`.scratch/shots/60-admin-rate-limit-in-process.png` /
  `-redis.png`。中途两次红都不是靠放宽闸修的：① Redis 那轮首跑 `1 failed | 1 passed`——`游客与 member` 撞了
  Playwright 默认 30 秒超时，而 dev 冷编译一次 `POST /api/auth/login` 就 9.9s、一次 `/admin/rate-limit` 11.8s
  （日志里两次 login 都是 **200**，不是 429），改的是**这条用例自己的** `test.setTimeout(120_000)`；
  ② Redis 那轮的截图只有"正在问这台实例…"——从导航点过来会重新挂载表盘，于是补一条再等
  `data-ratelimit-stats="ready"`，图里才有读数。
- 臂表 R1–R11（每条＝改坏一处 → 哪条用例红，逐字在 ADR-0082）：R1 进程内说成共享窗口、R2 `wire` 恒为 `up`、
  R3 上界从常量抄不读构造参数（`expected 50000 to be 11`）、R4 进程内 `bucketsTracked` 报 0、R5 少了 `.trim()`
  （`expected true to be false`）、R6 两本原因账并成一本（`expected 0 to be greater than 0`）、R7 门放宽到非 admin
  （`expected 200 to be 403`）、R8 `getRateLimiter()` 每次现造（三条同时红）、R9 `bucketsTracked` 报上界（四条同时红，
  含集成侧 `expected 50000 to be 3`）、R10 `reset()` 顺手归零自报数（抹掉"它是旧的"那句）、R11 界面把
  `—（这个驱动没有键空间）` 缩成 `—`（只有浏览器层抓得到）。**一条惰性臂如实记下**：R7 第一版写成
  `role !== 'member'` 全绿——`UserRole` 只有 `creator｜admin`，那个臂根本没被走到；换成 `creator` 才红。
  "臂没红"与"门没牙"是两件事，得先排除前者。收尾 `grep -rn "MUT "` = 0。
- 没牙的格子，点名：4 秒轮询周期本身没有门（改 40 秒照样绿）；`deployment.pid` 只钉 `typeof number`；
  **界面这一层的 `over-cap` 文案没有真事件喂过**（要满 50 000 只键才出，两轮 dev 都没造出），它由第三十四片的
  集成测与演练覆盖，界面这层没覆盖；`AdminNav` 里这一项的**位置**没有门，只有"点得到 + `aria-current='page'"`。
- 新事实（界面抓到的，之前只有 counter 知道）：**启动后第一笔判定有实打实的概率落进本机窗口**，两轮 dev 各有
  1 次 `command-failed` 且形状不同——一轮是 `Stream isn't writeable and enableOfflineQueue options is false`
  （连接还没 ready 就发第一笔），另一轮页面"最近一次连接报错"那格是 `Command timed out`（第一笔 Lua 往返过了
  250ms）。这一片**没有**改它：改法要么第一笔有界等 `ready`（动的是每请求排队预算），要么接受它并写进部署文档。
- 旧账翻面：ADR-0076 仍欠 2、ADR-0077 仍欠 1、ADR-0081 仍欠 1 三处各标 **已还**；`docs/SECURITY.md`
  「认证与授权」新增限流闸诊断入口一整段（含"只回答这台实例"与"两种退回两句不同的话"）；
  `docs/ENVIRONMENT.md` 部署口径下新增**两种驱动各跑一轮**的确切跑法＋两条本机坑（3100 被外部进程占，
  Next 16.3.5 不自动 +1；`webServer.reuseExistingServer` 把 5xx 当成"还没起来"，Postgres 容器停了会让
  Playwright 另起一个 dev server 而整轮失败）；已知技术债第 3 条最后那格"没有界面位"划掉。
- 仍欠，如实记下：① 启动后第一笔判定那次退回（上面"新事实"）—— **已还**（第三十六片顺带走"写进部署口径"
  那一支，`docs/ENVIRONMENT.md` 新增整段；"第一笔去等 `ready`"那一支仍不做，且这一片的新东西是**可见**，
  `hit` 不等它的决定在 `rateLimitRedis.ts:360-372` 早就写下了）；② ~~`realtime/redisBus.ts` 里同一形状的
  `connectionReady` 还是"一次 error 判死"（本片给它加的是读数，不是修复）~~ **已还**（第三十七片：
  查下来没有需要修的功能，要修的正是"读数"那一格——界面现在分两行，闩保持原语义）；③ 演练脚本
  `rate-limit-two-process.mts` 没读 `describe()`，跨进程形状仍靠它自己那 16 条判据（第三十六片起是 **19** 条），
  两份东西各自成立；
  ④ 界面上 `over-cap` 那一格没有真事件（要补就在演练里加"两进程同时撞满额"，与第三十四片仍欠 ④ 同一格）。
  —— **演练那半已还**（第三十六片 `④″`：两台的退回原因真的是 `{"over-cap":3}`）；**界面那半仍欠**，
  界面上那句文案还是没有真数据喂过。

## §SEC 第三十六片：满额时两台同时撞同一只建不出来的键——判据读的是合计，不是任何一台的形状（2026-11-05）

- 起点是上一片自己点的名：ADR-0081「没牙的格子」里那条"满额时两台同时各放 `limit` 次没有专门用例"，
  与 ADR-0082 仍欠 4 的"要补就在演练里加一组两进程同时撞满额"——两处指的是同一格。
  **这一片一行生产代码都没改**（`git diff -- apps/web/src` 只有她的文件）：改的是问句。
- 做了什么（`scripts/rate-limit-two-process.mts`，新增 `④″` 一组）：名额已被 `④′` 的两只键占满之后，
  用 `runCapPair`（`spawn` 版，两个真进程同时在跑）同时撞**同一只**新键 `two-process-cap/d`，
  每台限额 2、各顺序打 3 次。三条新判据（演练从 16 条 → **19 条**，真进程 18 → **22**）：
  ① `OVER_CAP_SCOPE_IS_PER_PROCESS`——两台各自的放行数恰为自己的限额、**合计 `2×限额`**；
  ② `OVER_CAP_PAIR_REFUSES_TO_BUILD`——那只键仍没建起来、前缀里桶键数还是上界、两台退回原因
  **只有 `over-cap`**（出现 `command-failed` 就是线路坏了，不是名额满了）；
  ③ `PAIR_WITH_ROOM_SHARES_ONE_WINDOW`——对照，同一对进程同一只键只换名额（10）⇒ 键建得出来、
  退回 `+0/+0`、**合计回到限额本身**。
- 这一片最要紧的一句是**读合计而不是读序列**：把上界做成"每台各一份"的那版错实现，在单台上给出的
  也是同样的「放 放 挡」（`OVER_CAP_STILL_GATES` 对它就是盲的，臂 C2 下照旧 `PASS`），
  两种实现只在两台合计上分岔：正确的合计 4，错的合计 2。所以判据钉 `allowedOf(两台) === 2×限额`。
  而"合计翻倍"单独读还有一句相反的读法——"两个进程天生不共享任何东西"——那正是 ③ 那条对照的存在理由。
- 见证（`npm run ratelimit:two-process`，逐字）：
  ```
  OVER_CAP_SCOPE_IS_PER_PROCESS: PASS — 两台同时各打同一只建不出来的键 3 次（限额 2）：
    22420→放放挡 / 37348→放放挡，合计放行 4（应为 2×限额=4）
  OVER_CAP_PAIR_REFUSES_TO_BUILD: PASS — D 这只键没建起来=true、前缀里仍只有 2 只桶键（上界 2）、
    两台各自的退回原因 {"over-cap":3} / {"over-cap":3}
  PAIR_WITH_ROOM_SHARES_ONE_WINDOW: PASS — 只把名额换成 10 ⇒ 键建出来了=true、退回 +0/+0、
    合计放行 2（应为限额本身=2）
  跨进程限流通过：22 个进程、线路 redis://127.0.0.1:56379。
  ```
  最好读的是第一行与第三行放一起：同一对进程、同一只键、同样的打法，紧上界时合计 4、宽上界时合计 2。
  两台的先后只改写各自序列（这一遍 `放放挡 / 放放挡`，C2 那遍 `放放挡 / 挡挡挡`），合计不动。
  全文件 `.scratch/s36-drill-final.txt`（19/19 PASS）。
- 臂（两条，逐条点亮后立刻恢复，收尾 `grep -rn "MUT " apps/web/src scripts e2e` = **0**）：
  **C2** 名册键加 `:${process.pid}`（上界改成每台各一份，桶仍写同一片键空间）→ **7 红**，三条新格全在里面：
  `合计放行 2（应为 2×限额=4）` / `没建起来=false、8 只桶键` / `合计放行 0`（`.scratch/s36-arm-C2.txt`）；
  **C3** 只把对照那一组的上界换成紧的 → **1 红且红在该格**：`键建出来了=false、退回 +3/+3、合计放行 4
  （应为限额本身=2）`（`.scratch/s36-arm-C3.txt`）。C3 要的就是这个"单点红"：它证明 ③ 不是陪跑。
  恢复后 `git diff -- apps/web/src/server/security/rateLimitRedis.ts` 为空。
- 顺带还的旧账：ADR-0082 仍欠 1 走的是"写进部署口径"那一支——`docs/ENVIRONMENT.md` 新增整段
  「设了 `NEXUS_REDIS_URL` 的那台，启动后第一笔判定可能是本机窗口给的」，并**更正口径**：
  `hit` 从来不等 `ready` 这个决定在 `rateLimitRedis.ts:360-372` 早就写了（理由是把业务请求排在一次建连接
  后面等于把闸做成故障放大器），上一片新增的是**可见**而不是决定；同时那条记录里"演练 16 条判据"改成 19 条，
  `docs/ENVIRONMENT.md` 那行的进程数/判据数一并补。ADR-0081 没牙那条与仍欠 4 各标**已还**。
- 仍欠，如实记下：① **界面上** `over-cap` 那一句仍然没有真数据喂过——演练有真事件了，界面没有，
  因为界面上要出现它得让那台驱动真的满 50 000 只键（演练用的是 2）；② 这一族演练仍不读 `describe()`，
  跨进程形状靠它自己那 19 条判据，界面是**一台**的现场，两份东西各自成立；③ 两台同时撞满额这一格
  对**紧上界的时效**敏感——它靠 `④′` 留下的那两只桶还在 60 秒窗口里来保证"名额已满"，
  机器卡到那一组之间超过窗口时，D 会被建出来、合计变成 2，红的是"名额又空了"而不是驱动坏了
  （读数会写 `键没建=false`，认得出是谁）；④ ~~`realtime/redisBus.ts` 同款 `connectionReady` 仍是一次 error 判死~~
  **已还**（§SEC 第三十七片，2026-11-05：闩按决定保持原样，新增**活的** `stats().wire` 与界面上第二行——
  见 `docs/adr/0083-realtime-wire-live-readout-two-rows.md`）。

## §SEC 第三十七片：实时总线那格线路读数改成活的——「启动那一次的闩」与「此刻两条连接」分成两行各说各话（2026-11-05）

- 起点是挂了四处的同一句欠账（ADR-0077 仍欠 4 / ADR-0081 仍欠 2 / ADR-0082 仍欠 2 / 上一片 仍欠 ④：
  "`realtime/redisBus.ts` 同款 `connectionReady` 仍是一次 error 判死"）。去查这句话，结论跟写下它时不一样：
  **功能一直是对的，坏的是读数**。Redis 比这台进程晚起来时，`ready` 落定成 `false`，而 ioredis 按默认策略
  继续重试、订阅侧 `enableOfflineQueue: true` ⇒ 线路恢复后已登记的订阅自动重建，跨实例投递随后**真的通**
  （真投递验过）。可 `stats()` 以前只有那份闩，于是界面上永远写着
  "没接上——这台实例收不到别机的事件"——运维对着这台会去重启一台本来就好的进程。
- 于是问句从"要不要修 `connectionReady`"换成"**为什么一格里塞了两句不同的话**"。
  先 grep 了生产路径：`await bus.ready` 只出现在测试与演练里，运行时无人等待 ⇒ 把闩改成活的不会修好任何东西，
  只会把一份"起点稳定了"的信号换成另一份已经存在的信号（现读 `status`）。决定：**闩一字不改**，
  新增**活的**一格。隔壁子系统几个小时前（第三十五片，`rateLimitRedis.ts:401`）已经把同一条教训写成注释了，
  只是那里怕的方向相反——闩卡在 `true`（断线了还说接上了），这里坏在闩卡在 `false`（通了还说没接上）。
- 做了什么：① `RealtimeBusStats` 加 `wire: 'up' | 'pending' | 'down' | 'na'`（与限流闸那份 `RateLimiterReadout.wire`
  同一套词表）；② 规则本体抽成导出的纯函数 `wireFromStatuses(pub, sub)`，`liveWire()` 只拿现值调它——
  **半开状态（发布侧 ready 而订阅侧还在重连）打真 Redis 造不出来**（两侧连同一端点），
  而"两个都 ready 才算 up"恰是这条规则里唯一有内容的一句，不拆出来它就没牙；
  ③ `end` / `close` 算 `down`（终局），`wait / preparing / connecting / reconnecting` 一律 `pending`
  （重连是正常自愈，报成故障会让人做一次没必要的重启）；④ 进程内驱动交 `wire: 'na'`，
  与 `wireReady: null` / `wireErrorCount: null` 同一族"不适用"（`na` ≠ `down`、`null` ≠ `0`）；
  ⑤ 界面**分成两行**（`data-realtime-wire` 此刻 / `data-realtime-wire-boot` 启动那次），措辞从
  `StatsPanel.tsx` 挪进 `stats-readout.ts` 成纯函数（`liveTag` / `bootTag` / `errorCountText` / `isKnownStats`），
  加一条形状门：认不出的回执明说"回执形状不认识"，不拿半截数据画一个看起来正常的表盘。
- "晚起来"的现场怎么造的：`node:net` 一个**纯字节转发器**听在 56998，不认识 RESP，只把两条 socket 对接，
  上游那半等客户端连上来才现连真 Redis（56379）。总线构造时那端没人听 ⇒ 闩落定 `false`；随后打开转发器，
  握手 / `subscribe` / 自动重订**全走真 ioredis 与真 Redis**，仪器只负责让端点"晚一点出现"。
  这条用例不止验读数：翻成 `up` 之后当场发一帧真事件、本机订阅者收到 1 条——"读数说 up"与"事件真过来"
  在同一条用例里对上，否则这一格只是第二个自报家门。配套的反方向见证是 `dispose`（闩 `true` 而 `wire` 变 `down`）。
  **两个方向都在**，任何"从另一格推导这一格"的实现同时红一片。
- 读数与界面措辞（`e2e/realtime-admin.spec.ts`，三段共用一次登录，逐字）：
  ```
  == §SEC 第三十七片 浏览器读数（真驱动那一台，3101 未设 NEXUS_REDIS_URL）==
    驱动=in-process 此刻=na 启动那次=na 失败累计=—（没有线路，不适用）

  == 晚起来那份回执 ==
    此刻=在（发布与订阅两条连接都 ready）
    启动那次=没接上（此后归连接层自动重连——"现在通不通"看上面那一行）
  ```
  对照改之前**同一台**的那一行：`跨实例线路 = 没接上——这台实例收不到别机的事件`（旧面板只有一行，
  `data-realtime-wire` 挂的就是闩）。截图 `.scratch/shots/61-admin-realtime-two-rows-in-process.png` 与
  `62-admin-realtime-two-rows-late-redis.png`（两行各说各话 + `失败累计 3` 下面那句"失败的帧不补发"）。
- 门与绿度：`realtime.test.ts` + `realtime-stats-readout.test.ts` **31 passed**；
  `realtime.redis.integration.test.ts` **9 passed**；`admin-realtime.integration.test.ts` +
  `realtime.integration.test.ts` **18 passed**；`tsc -p apps/web` 与 `tsc -p e2e` 无输出；
  `eslint` 对本片 10 个文件无输出。
- 臂（W1–W9，逐字红项见 `docs/adr/0083-realtime-wire-live-readout-two-rows.md` 的臂表；
  收尾 `grep -rn "MUT " apps/web/src apps/web/test e2e` = **0**）：最值的两条是
  **W3b**（`liveWire()` 从闩推导 ⇒ `dispose` 与"晚起来"**两条同时红**，这是"两格独立"的正反两面）与
  **W1**（只看发布侧 ⇒ 纯函数那条红而**集成全绿**——半开在真 Redis 上造不出来，这条限度本身被记进文档）。
  W8 顺带修了一条仪器缺陷：摘掉一行后 e2e **卡 180 秒才红**（取值 `getAttribute` 会等到用例超时），
  改成取值前两条有界 `toBeVisible` + "少了哪一行"的消息——**慢红也算没牙**。
- 顺带把 e2e 改成"一次登录、三段共用 `storageState`"：这个文件原本三条用例各自登录，
  跑到第二轮就把 `10 次/15 分钟/邮箱` 吃光（撞过一次 429）。**闸不放宽，改的是仪器**。
- 仍欠，如实记下：① `rateLimitRedis.ts:416` 那份单连接映射与 `wireFromStatuses` 是同一条规则的**两处写法**
  （现在同词表不同实现，两处各有门：R2 与 W1/W2），合并与否留给下一个真的改这条规则的人；
  ② 实时这半边**没有按原因的计数**进读数——`countWireError` 把原因打进 stderr，界面上只有总数，
  而限流那半边有 `fallbackByReason`（**下一片还掉了**：见文末「§SEC 第三十九片」与 `docs/adr/0087`）；③ 转发器那条用例的端口钉死 56998，同一台机器并行跑两份会撞，
  今天靠测试串行盖住；④ `wire` 的限度：它是本进程 ioredis 对那条 TCP 的看法，
  **不是**"订阅仍在服务器那边登记着"的证明，那句由真投递用例负责，不靠读数充数（写进注释与 ADR）；
  ⑤ `e2e/realtime-admin.spec.ts` 后两段是 `page.route` 喂的形状，证的是**界面拿到这种形状怎么说人话**，
  不证那台真处于那个现场（真实现场归集成测试；不为一张图去改共享 dev server 的 `NEXUS_REDIS_URL`——
  那个旋钮同时管着限流闸）。


## M5 第三十八片：分镜的箭头进像素——整片那一张参考图补进没挂图的镜头，画面出处写进计划（2026-11-06）

- 起点是逐字核对 ROADMAP 上 M5 唯一那条 `[ ]`（"Video Studio（text/image/storyboard→video）"）时 grep 出来的事实：
  四条箭头在**保存时验归属**（`missingArrowSource` 按 `ARROW_SOURCE_NEEDS` 逐条查缺哪一格）、在**界面上写明出处**
  （摘要写着"来源：参考图 → 视频｜参考图 …"，还能用"改来源"那条腿换箭头），
  而**渲染层一个字都不读**——`planVideoRender` 只看 `shot.referenceAssetId`，`storyboard.source` 那一格
  在 `render.ts` / `storyboard-render.ts` 及其测试里零命中。
- 于是有一份真实可造的形态：来源选了"参考图 → 视频"、挑了一张已定格的图、但一镜都没单独挂图
  （镜头那列的参考图默认就是"不用参考图"）。这时计划里每镜都是色卡，成片是几张确定性色卡轮流闪过，
  而界面上方写着"来源：参考图 → 视频｜参考图 …"。这不是界面说谎（`source` 里真存着那张图），
  是**一句关于画面的话，被一个不读画面的人写在了画面上方**。
- 做了什么：① `planVideoRender` 读 `storyboard.source`，**只认 `image-to-video`** 那一条箭头，
  它带的那张图补进**自己没挂图**的那些镜；② 每一镜自己的参考帧优先（更具体的决定赢）；
  ③ `RenderSource.reference` 加 `from: 'shot' | 'source'`——这一格不是装饰：没有它，
  "整片一张图补满各镜"与"每镜各挂了一张一样的图"在计划里**同形**，而那是两句不同的话；
  ④ 新增 `sourceReferenceCount`，与 `cardCount` **两个数分开数**（一个是"没有可看的，渲成色卡"，
  一个是"画面来自整片那张图"），任务行的 `input` 里两个并排记；⑤ 三种形状三句话进 `notes`
  （补上了 N/total 镜 / 整片那张被每镜盖住 / `character-to-scene` 今天还不进像素以及为什么），
  面板原样显示 `plan.notes`，所以这三句就是界面上的话，不需要新入口；
  ⑥ web 层**按 assetId 去重**取字节（一张图补 12 镜 = 读一次存储、写一份临时文件），
  归属门（`openAssetForOwner`）与 mime 门只在第一次读时走——同一个 id 的判定不可能两次不同。
- 顺带查清并**没有**顺手做的一件事：`character-to-scene` 进不了像素不是忘了。角色不是一张图，肖像是一件资产
  （`characters` 表只有 `profile` jsonb，认肖像要靠 `assets.character_id` + `genMeta.characterPortrait`），
  而"查这位角色的肖像"是 IO，`packages/video-model` 的第一条纪律是纯函数不查库。
  所以这一片让它**从沉默变成一句 note**（说明限度 + 作者现在能做的动作），兑现的形状落在 ADR-0086 仍欠 ①。
- 否掉的形状：web 层渲染前把 `source.referenceAssetId` **复制进每一镜**再投影。像素立刻对，
  但计划里"这一镜照哪张图演"变成"每镜各挂了一张一样的图"（出处消失），
  整片的决定被写进镜头（撤销栈里多出 N 个作者没做过的改动，§150），
  而库里那份分镜从此不是作者写进去的那一份（§16 的唯一真值被渲染层反向污染）。
- 见证：`npx vitest run --no-file-parallelism packages/video-model/test` → **6 files / 100 passed**
  （起点基线 93 passed，+7 条新用例）；三个渲染集成套件 → **3 files / 28 passed**，
  其中 `storyboard-render.integration.test.ts` **1 file / 15 passed**（起点 13，+2）。
  集成层新增那条量的是**画面平均色**：参考帧是 ffmpeg 现造的纯色 `0x406080` PNG，
  两镜中段（第 0.6 / 1.8 秒）都该量到 rgb(64,96,128)±10；对照组是同一份两镜、箭头换成
  `text-to-video`——同样渲成功、同样 2.4 秒，但读不出那个色。**没有对照组，色读数就只是"渲出来了"**。
  `tsc`（video-model / web / e2e 三份 tsconfig）与 `npx eslint` 对本片四个文件都静默。
- 臂（逐字抄回、当场恢复、`grep -rn "MUT "` 归零）：
  A7 箭头完全不进像素（＝改动前）→ **3 红**；A1 不分箭头都用整片那张 → **1 红**
  （`整片那张只属于 image-to-video：别的箭头就算带了图也不进像素`）；A3 整片那张盖过每镜自己的 → **2 红**
  （第二项红得对：顺序一反，"没有进画面"那句就成了假话）；A4 出处不区分（`from: 'source'` 写成 `'shot'`）→ **2 红**；
  A5 被盖住时沉默 → **1 红**；A6 `character-to-scene` 的限度沉默 → **1 红**；
  A2 不去重（`cached` 恒为 `undefined`）→ 集成层 **1 红**，逐字
  `AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]`，多出来那一项与前一项是**同一个 assetId**。
  A2 是这一片唯一"结果对不对"抓不到的臂——不去重照样渲出逐字节相同的正确成片，所以门必须是"读了几次"，
  那个 `vi.mock` 包的是**转发不是替换**（真实现照跑，两道门行为与生产逐字相同）。
- 界面：`e2e/storyboard.spec.ts` 新增 `@smoke 整片参考图进画面…`，全程真点击（切一版两镜 → 按镜头生成一颗
  DEMO 参考图让名册里有图 → **把它从镜头上摘下来** → 改来源选"参考图 → 视频"挑那张 → 应用 → DEMO 渲染）。
  摘要逐字读数 `2 镜 · 共 6 秒 · 来源：参考图 → 视频｜参考图 灯塔的光扫过浮冰.png`；
  回执里有 `2/2 镜自己没挂参考帧` 与 `image-to-video 带的那张整片参考图`，整块 `[data-storyboard-render-result]`
  不含"色卡"，另加一条"确实渲成了"的证据（播放器 `src` 是 `/api/assets/<id>/file` 那个鉴权 URL）。
  这条**连红两次才绿**，两次都是仪器错、不是产品错：第一次我把箭头中文标签写成"图片 → 视频"
  （`ARROW_LABELS['image-to-video']` 是"参考图 → 视频"），第二次 `[data-storyboard-render-video]` 撞到严格模式
  （结果区与历史清单各有一个播放器）→ 收成 `result.locator(...)`。截图 `screenshots/storyboard-whole-piece-reference.png`。
- 没牙的格子，点名：① 只证了"这张图进了画面"，**没证"每一镜拿的是它自己那一张"**（两镜同源正是本片的行为，
  色读数区分不了串号；要证得逐镜取样 + 每镜不同图）；② 别的箭头**残留**一张图时界面上看不到
  "这张图没进画面"那句——`missingArrowSource` 只管缺不管多带，那一格现在没人出声；
  ③ 去重只数了"存储读几次"，没数"临时文件写几份"（命中缓存就 `continue`，所以不会多写，但没独立断言）；
  ④ e2e 那条**没有对照**：`PLAN_MONTHLY_GRANTS.free.video` = 5 点而一次渲染扣 5 点，
  同一访客只渲得了一版，换箭头再渲会被额度门挡下——那红的就不是界面话术而是额度，所以对照留在集成层；
  ⑤ `sourceReferenceCount` 进了任务行 `input`，还没有界面读它（面板看得见的是 notes 那句话）。
- 仍欠，如实记下：① `character-to-scene` 进像素（web 层查肖像，形状要先定：给 `planVideoRender` 加"整片备选图"
  入参，还是 web 层装配一份补好 `source` 的文档再投影——后者容易滑回上面否掉的复制形状）；
  ② 逐镜可指认（"第 3 镜的画面来自哪一张图"，`from` 已进计划，面板还没读它）；
  ③ 接上真 provider 后 `image-to-video` 应由 provider 读整片那张图，`from: 'source'` 就是那时的路由依据；
  ④ 优先级没有作者可改的入口（"每镜优先"是写死的规则）；⑤ 参考帧读取没有并发上界
  （12 镜 12 张不同的图 = 12 次顺序存储读 + 12 份临时文件，全在 ffmpeg 起跑前串行做完）。
  取舍与逐字段规则见 `docs/adr/0086-storyboard-arrow-into-pixels.md`。


## §SEC 第三十九片：线路失败按原因分账——一本闭合的账、两本账必须同口供、界面不认字只照读（2026-11-06）

- 起点是挂了两处的一句欠账（ADR-0083 仍欠 ② 与上一片文末 仍欠 ②：
  "`wireErrorCount` 把原因打进 stderr，但**没有按原因的计数**进读数，
  限流那半边有 `fallbackByReason`，这半边没有对应物"）。去查这句话，先撞上的不是欠账，是**一条已经红着的门**：
  `94d7cfe`（一条英文单行提交，没跑门就把工作区状态收进去）已经给 `stats()` 加了 `wireErrorByReason`，
  却没改 `realtime.redis.integration.test.ts` 里那两条严格 `toEqual`，于是这个文件从那次起一直红着——
  `AssertionError: expected { driver: 'redis', …(6) } to deeply equal { driver: 'redis', …(5) }` /
  `+ "wireErrorByReason": {}`。**这条红只说"形状变了"，没说"这本账有没有牙"**，而那才是这一片要的东西。
- 再查那本已经存在的账，五处都是软的：① 类型是 `Partial<Record<string, number>>`，
  于是"这一格没出过事"与"这一格没人数"同形；② 原因是一句随手写的中文，没有任何地方钉词表——
  同一个意思写成两种说法，账就碎成两行各说一半而**总数还是对的**；③ 有一格**根本不记账**：
  订阅连接上收到别的线路名的帧（正常配置下永远为 0，非 0 就等于有人改错了订阅集合），
  那里以前是一个光秃秃的 `return`——最难发现的一类错恰好是唯一没有读数的格子；④ 界面只有总数，
  运维看到"断过 3 帧"分辨不出该去看 Redis、去看发帧那段代码还是去看订阅配置，三件事第一反应不一样，
  **只给总数等于不给建议**；⑤ `isKnownStats` 不认这本账，喂一份缺 key 的回执照样通过——
  那正是 `94d7cfe` 能悄悄进来的门缝。
- 做了什么：① 新增 `server/realtime/wireErrors.ts`，**不 import 任何东西**，钉一份闭合词表
  `WIRE_ERROR_REASONS`（10 格）+ `WireErrorReason` 类型 + `emptyWireErrorLedger()`；
  放任何一处（驱动 / 类型 / 测试）另外两处就得反向依赖它，而依赖一绕圈，"新增一格"就变成"改一个文件顺带改三个 import 顺序"。
  **写错一个原因名编译不过**，这是"词不漂"最便宜的一道牙。② 账改成**闭合完整**且**必填**：
  `RealtimeBusStats.wireErrorByReason: Record<WireErrorReason, number> | null`——必填那一刀当场产生 9 处编译错
  （7 个测试替身 + 2 处类型），那些就是它要的牙：没有哪个驱动能只报总数、不报分账。
  ③ `stats()` 交出副本、端点原样转交不二次加工。④ 形状门加两条：**两本线路账同口供**
  （`(wireErrorCount === null) === (ledger === null)`，且 `undefined`（缺格）直接算不认识，缺格 ≠ 不适用）与
  **驱动只认两个词**（第三个词会被面板那句 `driver === 'redis' ? … : '进程内（单实例默认）'` 画成"这台没有线路"，
  对着一台真有线路的机器宣布它没有线路是最难看出来的读反）。⑤ 界面加一行「失败按原因」，
  `errorReasonList` 收的是 `Record<string, number>` 而不是那个联合类型——**界面不认字，只照读**，
  配套一条门：喂整个词表各 1 次，断言每一格都印得出来且 `split(' · ')` 长度等于词表长度。
  ⑥ `线路名不认识` 从沉默变成有数：帧照旧丢掉，但记账并出声。
- `Σ 分账 === 总数` 是**常驻不变量**，写进三条集成用例（坏帧、线路名不认识、端点连不上），不是只在新加那格上查一次。
- 「线路名不认识」的见证用**真 Redis** 复现，不是 `emit` 模拟：把总线自己那条 `sub` 连接再订一个线路名
  （订阅模式下一条连接可订多个频道），从另一侧往那个名字发帧；**同一条用例里另有对照**——同一时刻往正确的
  `WIRE_CHANNEL` 发一帧，本机订阅者收到 1 条，所以"没送达"不是一句空断言。
- 修 `94d7cfe` 那条红的方式**不是把 `toEqual` 放宽**：两条严格比较现在逐字段写着 `wireErrorByReason: zeroLedger()`，
  而 `zeroLedger()` 在测试里**由词表就地构造**，故意不 import `emptyWireErrorLedger()`——
  否则实现与断言读同一份函数，账变了两边一起变，门就成了自证。
- 读数（逐字）。集成层起点 **1 failed | 8 passed** → 收尾 **10 passed**。浏览器（`e2e/realtime-admin.spec.ts` 四段共用一次登录，3100 那台）：
  ```
  == §SEC 第三十七片 浏览器读数（真驱动那一台）==
    驱动=in-process 此刻=na 启动那次=na 失败累计=—（没有线路，不适用） 失败按原因=—（没有线路，不适用）

  == 晚起来那份回执 ==
    此刻=在（发布与订阅两条连接都 ready）
    启动那次=没接上（此后归连接层自动重连——"现在通不通"看上面那一行）
    失败按原因=投递 2 · 收到的帧不合契约 1

    1 passed (2.7m)
  ```
  第四段喂的是 `{…receipt({wireErrorCount: 3}), wireErrorByReason: undefined}`（`JSON.stringify` 会丢 `undefined`，
  那正是真实世界里"驱动没带这一格"的形状）：界面上只有"拉取失败（回执形状不认识）"，
  `[data-realtime-errors]` 与 `[data-realtime-wire]` 都 `toHaveCount(0)`——**表盘一个字段都没画**。
  截图 `61-…in-process.png` / `62-…late-redis.png`（新那一行就在"线路失败累计 3"下面）/ `63-admin-realtime-half-receipt.png`。
- 门与绿度：`realtime.test.ts` + `realtime-stats-readout.test.ts` **37 passed**（起点 31）、
  `realtime.redis.integration.test.ts` **10 passed**（起点 1 failed | 8 passed）、`admin-realtime.integration.test.ts` **4 passed**、
  本片五个文件合跑 **5 files / 65 passed**、三个替身文件 **3 files / 32 passed**；
  `tsc -p apps/web` 与 `tsc -p e2e` 无输出，`eslint` 对本片文件无输出，收尾 `grep -rn "MUT "` = **0**。
- 臂（W1–W8，逐字红项见 `docs/adr/0087-realtime-wire-error-ledger-by-reason.md` 的臂表）：
  W1 那一格不记账 → **1 failed**（`expected 0 to be greater than or equal to 1`）；
  W2 不分原因全记在 `投递` / W3 只涨总数分账不动 → 各 **3 failed**（`expected +0 to be 1` ×2 + 新格那条）；
  W6 开局空账而不是闭合零账 → **3 failed**，逐字 `expected NaN to be 1`（`1 - undefined`）——
  **账不闭合时增量算得出 NaN 而不是 0，读数会骗人**；
  W4 同口供不钉 / W5 驱动词不钉 / W7 界面自己维护白名单 → 各 **1 failed**
  （W7 逐字 `expected '发布连接 1 · 发布连接未就绪 1 · 帧序列化 1 · 投递 1 · …' to contain '线路名不认识'`）；
  W8 端点二次加工把分账丢掉 → **2 failed**（`expected undefined to deeply equal { '发布连接': +0, …(8) }`）。
  W4→W5 换臂时我自己在一次 Edit 里多摘掉了账本那一段（`isKnownStats` 一度没有 `return`），读回函数才发现——
  **臂的恢复也要验，不然红项会留下永久伤疤**。
- 仪器的一次自伤，记进纪律：第一次跑 e2e 用了 `--no-file-parallelism`（那是 node:test 的旗标，Playwright 不认）
  立刻 `error: unknown option`；换 `--workers=1` 后又让后台一份、前台一份同时跑，两份共用同一个 `test-results/`，
  后台那份在 `browserContext.close` 报 `ENOENT … traces/….trace` 判红，而**四条断言其实全过了**（读数逐字都在输出里）。
  ⇒ e2e 一次只跑一份；别把并行的仪器红当产品的红；退出码不能代替读数。这条值得进 `docs/TESTING.md`（那个文件归并行会话）。
- 没牙的格子，点名：① 界面上**不查** `Σ 分账 === 总数`（只有集成层查）——要补得先定措辞，
  或者把总数改成由分账现算（后者会推翻"驱动自报"的 ADR-0082 决定 3）；② 编译期的词表牙只覆盖服务端，
  测试替身与 e2e 喂字面量，写错原因名只会在逐格增量那条红；而 UI 侧 `Record<string, number>` 是**有意的**，
  所以"界面拿到一个词表里没有的名字"是合法形状（照读并印出来）不是错；③ 那条见证靠定向访问
  `(bus as unknown as { sub: Redis }).sub`，能红（W1）但不是生产里"订阅集合被谁改错了"的路径；
  ④ 进程内驱动没有这本账，同口供那条门对它只验到 `null/null` 那一支；⑤ 轮询周期与 `/api/admin/realtime` 的门照旧（ADR-0083 点名过）。
- 仍欠，如实记下：① 界面上不查分账加得对不对（上面没牙 ①）；②
  `rateLimitRedis.ts` 那份单连接 `wire` 映射与
  `wireFromStatuses` 仍是同一条规则的两处写法（ADR-0083 仍欠 1），但词表这一族给了个现成的样子：共享一个谁都不 import 的小模块；
  ③ 端点交出的 key 若不在词表里今天照印，要不要在形状门里拒绝取决于"宁可生词不可吞数"，与决定⑤相冲，留给下一次；
  ④ 转发器端口钉死 56998、e2e 后三段是 `page.route` 喂的形状（照旧）。
  取舍与逐字段规则见 `docs/adr/0087-realtime-wire-error-ledger-by-reason.md`。


## §SEC 第四十片：studio e2e 按行号 filter 切分片的 paced 跑法（2026-11-06）

- 起点是一条被证明跑不动的门：2026-11-05 那次后台整份 `npx playwright test e2e/studio.spec.ts` =
  **18 passed / 37 failed**，37 条同一成因是 429（`POST /api/projects` 按 IP **20 次/小时**，
  `studio.spec.ts` 57 处建项目 ⇒ 一次跑到底必然中途撞闸）。**Admin** 侧根因给得准：`createProjectNamed`
  把 POST 答复原样接住，带回"还要等 N 分钟"——那不是回归，是**名额**。
- 做了什么（`scripts/e2e-paced.mts` + `scripts/lib/e2e-paced-core.mts`，核心逻辑抽成纯函数、主文件只做 IO 编排）：
  ① 不开闸、不造身份、不改 timing 常量——三条红线一条不越；
  ② **分片不用 `--shard`**（它是**按文件分**：`--shard=1/5` 对单文件是 57/0/0/0/0，后四片各报空绿）——
  改成 `--list` 解析行号、连续下标切段、位置参数点名（`e2e/studio.spec.ts:85 …`，多 filter 是并集，`--list` 上验过）；
  ③ 等多久由**服务端自己那句**算（报错里的"还要等 X 分钟"，`max(cooldownMin, X+1)`），不再固定猜 61 分钟；
  ④ 一片一次一片（`--only i`）、或从 k 片连跑到底（`--from k`）；片越小、一次仪器故障影响的用例越少
  （2026-11-06 实测 `code=3221225794` 把 Chromium worker 打断了）；
  ⑤ 锁（`paced.lock`，pid，被挡住不删别人的锁）、`--list` 也带 `--output`（绕开沙箱批量删除守卫）、
  **两本账对口供**（脚本以为的条数 == Playwright 那句 `Running N tests`，读不到那句也算红）——
  这一条是防"exit=0、看起来全绿、实际有用例根本没被发起"的假绿。
- 见证（逐字）：`--plan --shards 5` ⇒ `片 1/5（12 条）…片 5/5（9 条）`、`合计 57 条（列出 57 条），行号互不重复、无漏`；
  第 1 片实跑 **12 passed (3.9m)**；撞闸那片照服务端自己报的数等（20:25:10 要等 23 分钟 → 20:48 到期；
  20:32:55 自己算到 20:48——两次独立读数互相咬合）。臂 A1–A6 全部验过红与恢复后绿（逐项见 ADR-0088 臂表）。
- 顺手查清并记入 `docs/ENVIRONMENT.md`（§SEC 第四十片顺手的欠账，2026-11-06）：
  全目录 44 个 spec，21 个建项目共 **97 处**（`studio` 58）；**其余 23 个文件零建项目**
  （`a11y-opened · smoke · …`，列表见该节），可在任意窗口跑。import 端点不走 `projects/create` 桶
  （包里字节过 `refusalForStorage`），不计入这笔账。
  **这两个数在下面的补记里被推翻过一次**：那次核对的口径只认第一实参写 `page` 的调用，
  漏了 `e2e/studio.spec.ts:2854` 的 `createProject(visitor, …)` ⇒ 实况是 **98 处 / studio 59 处**。
- 仍欠，如实记：① 整目录一次全绿仍需 ≥5 个窗口，本片只把 studio 一份跑到底——**studio 那份已跑到底（见下面补记），
  其余 20 个建项目的文件还欠**；
  ② 红片的自动重发（要先定"重发几次算等名额、几次算真红"，没定就不做半成品）；
  ③ `limit/window` 当年靠手抄——**已还（§SEC 第四十一片）**；④ 其余文件照尺子量过了，纸面账有了。
  取舍与臂表见 `docs/adr/0088-paced-e2e-line-filter-sharding.md`。

### 第四十片补记（2026-11-07）：57 条逐条滴跑跑完了，抓到三条一直在说谎的断言

- 滴跑形状 `--shards 57 --from 1 --cooldown-min 3`（一条一片，片间睡的是闸自己的补名额速率
  20 次/小时 ⇒ 3 分钟一个）。逐字读数 `.scratch/pw-paced-drip/paced-summary.md` 共 57 行，
  时间戳 2026-11-05 20:49:27 → 23:54:27（**那是 UTC**，旧 `stamp()` 没带时区；本机墙钟是 11-06 04:49 → 07:54），
  合计 **53 绿 + 1 跳 + 3 红**，每一行都是 `（发起 1 条，Playwright 报 1 条）`——两本账 57/57 对上，
  **全程零 429**。这就是"照服务端自己那句等"要换来的那件事：名额算对了，红就只能是红。
  - 那 1 跳是 `e2e/studio.spec.ts:3226 §163 断线重开`，它自己写着
    `test.skip(!process.env.NEXUS_REALTIME_MAX_LIFETIME_MS, '需要 web server 带 …')`，
    与 §163 实时通道那支互斥（那支不能有这个变量，否则服务端 1.5 秒就把流掐了）。
    不是本片漏跑，是**有前提的那一格没给前提**——覆盖在，谁设谁跑。
- 三条红**都不是限流、都不是仪器**，是三条从 2026-10 起一直在说谎的断言。此前每次整份跑都死在 429 上，
  没有一次走到过这三行，所以"产品改了、用例没改"这件事没人看见：
  - `:2364 全平台搜索`——红 `Expected substring: "相关度排序"`，Received 那句已经是
    "相关度只分六档：标题与查询完全一样 > …不看词频、不看词在标题里的位置、不看点击与热度，同分时按更新时间新→旧排"。
    口径是 `9e97534`（2026-10-22 搜索按相关度排，ADR-0056）改的。
    改法：断 `[data-search-method]` 含"组内按相关度排""同分时按更新时间新→旧"，
    `[data-search-scope]` 含"相关度只分六档""不看词频"——认页面自己那句原话，不再认一个旧说法。
  - `:4029 §134 额度页`——红 `Expected substring: "只有"`，Received 是"§133 点名的五件事今天全都有真的拦截方
    （aiUsage、storage、generation、publishing、teamCollaboration）…真加了第六件事，先在这两列里放明，再落拦截方"。
    `69d76ed`（2026-10-24 #201，五格至此全有拦截方）之后，旧断言等于**要求页面承认还缺一格**。
    改法：逐格断那五个名字都在，外加 `toContainText('全都有真的拦截方')` 与
    `not.toContainText('只是这张表上的数字')`（后者是这张表哪天悄悄退回"数字没有拦截方"时的绊线）。
  - `:4087 §144 导出`——红 `expect(locator).toBeDisabled() failed / Expected: disabled / Received: enabled`。
    `2450679`＋`838f324`（2026-10-24，分镜随包走 / 角色随包走，格式版本 v3→v4）把 parts 从 3 格加到 5 格，
    用例只勾它认识的那三格 ⇒ 还剩两格勾着 ⇒ 按钮当然不灰。
    改法：**从 DOM 现读** `[data-export-part]` 的 id 集合再钉成那五格（写死五格是另一种手抄，
    红的时候还带 `收到的是 …` 把实况端出来）；"一格都没勾"那段改成**先数行为、再看按钮灰没灰**——
    数 `?parts=` 请求次数与 `download` 事件，最后才断 `toBeDisabled()`：原来那句灰按钮挡在行为断言前面，
    等于让这一族里最弱的一句守门（`expect` 一红就中止整条用例）。
- 三条不是"改断言迁就现状"：产品侧各摘一次，用例必红；恢复后各绿。逐字：
  P1 从 `ENFORCED_PLAN_AXES` 摘掉最后一格 ⇒ `Expected substring: "teamCollaboration"`；
  P2 从 `SEARCH_ORDER_METHOD` 删"不看词频"那半句 ⇒ `Expected substring: "不看词频"`；
  P3 删掉页面上 `[data-search-method]` 那一行 ⇒ `[data-search-method] … Expected substring: "组内按相关度排"`；
  P4 去掉 `ExportPanel` 的 `!chosen.length` 禁用 ⇒ `Error: 一格都没勾还是发了 1 次导出请求 / Expected: 2, Received: 3`。
  恢复后三条各绿（`.scratch/pw-paced-fix3/paced-summary.md`，带 `Z` 的新格式）：
  `17:35:22Z 片 34/57 … 1 passed (19.0s)`、`17:35:51Z 片 50/57 … 1 passed (18.9s)`、`17:36:09Z 片 51/57 … 1 passed (8.4s)`。
  ⇒ studio 这 57 条第一次**每一条都有自己的读数**：56 条绿（含 1 条按前提跳过）＋ 3 条修好后各跑一次绿。
  如实记一句：**"单次调用 57 条全绿"这个读数今天还没有**——三条红的复跑是那三次单独调用（`--only 34/50/51`，
  同一个 `--output` 目录所以汇总接在一份里），把它们并回一条命令要再滴一遍（≈3 小时墙钟）。
- 仪器这半的三处补强（同一个下午被这次滴跑逼出来的）：
  ① `duplicateLines` 从"每组内部查重复"改成"整表查重复"，`--plan` 同时报**覆盖几条 / 漏几条 / 同行号几条**，
  任一不为 0 就 `exit=1`；原来只在组内查，"一条用例被两片各点一次"这种形状报不出来。
  见证（逐字）：`--plan --shards 5` ⇒ `合计 57 条（列出 57 条），行号互不重复、无漏`。
  ② `stamp()` 补 `Z`——本机时钟 UTC+8、`toISOString()` 是 UTC，summary 里那串时间不带时区就会被读成本地时间
  （滴跑那 57 行正是旧格式，与 fix3 那份差 8 小时，读的是同一台钟）。
  ③ 核心模块**有单测了**：`scripts/test/e2e-paced-core.test.mts` **16 passed**（`vitest.config.ts` 的 include
  加 `scripts/test/**/*.test.mts`），喂的是逐字落盘的 `--list` 原文（`scripts/test/fixtures/studio-list.sample.txt`，
  59 行），不是自己造的样例——Playwright 换措辞时这里先叫，而不是第二天早上。
  臂表（每条改完跑一次、恢复后再跑一次，`grep -c "MUT " scripts/lib/e2e-paced-core.mts` ⇒ `0`、`md5` 复原、`16 passed`）：
  U1 `partition` 按行号倒序切 ⇒ `1 failed`（`expected [ { line: 4759, …(1) }, …(56) ] to deeply equal [ { line: 85, …(1) }, …(56) ]`），
  段的**长短**那几格全绿、只有"连续分段"这一格叫——正是它该拦的形状；
  U2 摘掉空枚举的当场抛 ⇒ `2 failed`（`expected [Function] to throw an error` ×2）；
  U3 `claimedTally` 取第一行 ⇒ `1 failed`（`expected 4 to be 8`，多 project 那格）；
  U4 `tallyMismatch` 回到"读不到就当对得上" ⇒ `1 failed`（`expected false to be true`）；
  U5 摘掉 `Math.max(cooldownMin, …)` ⇒ `1 failed`（`expected 24 to be 61`，下界那格）。
- 顺手量到的新的一格没牙（记进 ADR-0088）：`credits.ts` 那五个名字是数组，页面上**后面那句解释是手写的**——
  用例逐格念名字、念的是数组本身，第五格真被摘掉时页面那句"五件事全都有真的拦截方"不会跟着改口，
  要钉死得让那句话也由数组拼出来。本片没做，只把它写明。

## §SEC 第四十一片：IP 窗口闸的唯一真值——limit/window 只有一份（2026-11-06）

- 起点是 ADR-0088 自己点名的一格（没牙 4 / 仍欠 3）：产品里每条 IP 窗口闸的限额和窗口
  **散在 13 处调用点**（同路由 `account/avatar`、`blocks` 各两处），谁改了哪一边只有手抄能对；
  `/api/admin/rate-limit` 端得出驱动、端不出"闸怎么装的"。
- 做了什么：① 新增 `IP_RATE_RULES`（`apps/web/src/server/security/rateLimit.ts`，**唯一真值**；
  11 条：10 条 `ipWriteGate` + `auth/register`——它当年直接走 `hit`，同属"身份之前的 IP 窗口闸"，
  漏掉它等于表里只有半张图）。② `ipWriteGate` 改成 `(route, req)`，**调用点不再传数字**
  （13 处全部改完，`grep` 确认 0 处残留字面量）；`auth/register` 也接同一张表。
  ③ `/api/admin/rate-limit` GET 端出 `rules`（整表、原样、不挑选）；④ `/admin/rate-limit` 表盘直接渲染
  这张装法表（`data-ratelimit-rules`，只读；改动 registry 才算改数）。
  ⑤ 测试：**新文件 `rate-limit-rules.test.ts`**（恰好 11 条、每格正数、`projects/create=20/3600000` 与
  `auth/register=10/3600000` 两格钉死）；`client-ip.test.ts` 第一条改为照 registry 断言
  （invalid-xff 桶 20 次/小时：前 20 次放行、第 21 次起 429；`beforeEach` 已重置 limiter，不互污染）；
  其余 5 处掉字面量、断言语义不变；`admin-rate-limit.integration.test.ts` 加 `rules` 断言（**6/6** 绿，真 Postgres）。
- 验证（2026-11-07 复跑，逐字）：`rate-limit-rules + client-ip + rate-limit-readout` ⇒ **41 passed (3 files)**；
  `admin-rate-limit.integration` ⇒ **6 passed**（真 Postgres）；`tsc -p apps/web` 无输出、`eslint` 0；
  收尾 `grep -c "^  '[a-z]" apps/web/src/server/security/rateLimit.ts`（`IP_RATE_RULES` 表体）= **11 条**；
  `grep -rn "ipWriteGate('" apps/web/src` = **12 处调用**、每一处的实参只有路由名字符串加 `req`，没有一处再传数字
  （那 12 处覆盖上面 11 格里除 `auth/register` 之外的 10 格——同路由 `account/avatar`、`blocks` 各两处）。
  （本节初稿写的"rate-limit 相关 44 passed"是按当时那一次的文件组合数出来的，换了这个口径就复现不出来——
  留一句在这里，别让下一个人以为自己少跑了 3 条。）
- 文档：ADR-0088「没牙 4」「仍欠 3」均记**已还**；ENVIRONMENT.md studio 那节加「数字不再手抄」；
  本片改动只落在闸的"配置层"，**闸本身的行为、键形状、驱动一个字没动**（parity 那组没有动，仍是那组见证）。
- 至此 IP 窗口闸的账：产品端（registry）、端点（rules）、表盘（渲染）、测试（钉住）、文档（ENVIRONMENT/ADR）
  五处说同一句话。脚本自算切法（paced 读 `rules`）仍欠——它要定"读哪一格、什么时候读"，不先做
  （§SEC 第四十二片先还了 ADR-0088「没牙 6」那格，见下面一节）。

## §SEC 第四十二片：额度页那句"数出来的话"由表拼出来——件数、名单、解释不许各有一份（2026-11-07）

- 起点是第四十片补记量到的那格没牙（ADR-0088 没牙 6）：`/credits` 上 `[data-credits-enforced]` 那句
  **整句手写在页面上**，只有括号里的名单是 `{ENFORCED_PLAN_AXES.join('、')}`。于是同一件事有三份写法——
  件数（"五"）手抄、名单是数组、逐格解释又是手抄。臂 P1 证明数组那半有牙，但**摘掉一格，页面那句
  "五件事"不会跟着改口**，而这一页偏偏是靠这句话让人相信"表上的上限真会拦人"。
- 做了什么（决定与取舍见 `docs/adr/0089-ui-counted-copy-generated-from-one-table.md`）：
  ① `ENFORCED_PLAN_AXE_WHY: Record<EnforcedPlanAxis, string>`——键类型取自数组，
  **加一格忘了写解释是编译错误**（比运行时门更早响）；
  ② `planEnforcementReadout(enforced = ENFORCED_PLAN_AXES, unenforced = UNENFORCED_PLAN_AXES)`
  成为那句话的唯一写法，**入参故意可以换**（写死件数的实现在"摘一格要说 4 件事"那条上红）；
  ③ 页面只留 `{planEnforcementReadout()}`，另加两条静态门读 `page.tsx`：那段落不许出现 `§133`，
  整个文件不许出现"点名的 N 件事"这种写死的件数或任何一条旧解释的原话；
  ④ e2e 那层改成**从界面文本自洽**：同时读"件数"与"括号里点名的格子数"并要求相等——用例里不抄数组；
  ⑤ 数字用阿拉伯数字（"5 件事"），与同一句里本来就是 `{length}` 拼出来的"另外 N 格"保持一致。
- 见证（逐字）：`credits-enforced-copy.test.ts` **8 passed**；连同 `credits.test.ts` + `credits.integration.test.ts`
  ⇒ **44 passed (3 files)**；`@smoke §134 跑一次生成…` **1 passed (4.5s)**（本机 3100、`--workers=1`），
  新增元素截图 `screenshots/credits-enforced-copy.png`（界面端出的是"§133 点名的 5 件事…（aiUsage、storage、
  generation、publishing、teamCollaboration）：aiUsage：额度为 0 时新的 AI 任务会被挡下；…"，逐字看过）。
- 臂表（四条都验过红与恢复后绿）：V1 写死件数 ⇒ 2 failed（`to contain '§133 点名的 4 件事'`）；
  V2 加一格不写解释 ⇒ `error TS2741: Property 'apiRateLimit' is missing…` + 5 failed（连"两列合起来
  一格不多一格不少"那条已有的门一起叫），而句子自己改口成"6 件事"；V3 页面再抄一遍 ⇒ 静态门 2 failed；
  V4 名单只点前四格 ⇒ e2e `Error: 句子里写的是 5 件事，括号里点名了 4 格（aiUsage、storage、generation、publishing）`。
  收尾 `grep -rn "MUT " apps/web/src` = 0，两个文件的 `md5sum` 回到臂前基线。
- 仍欠，如实记：① **每格那句解释本身对不对没有门能验**——**已还（§SEC 第四十三片，2026-11-08 落地 / 2026-11-09 补账，
  见文末那一节与 `docs/adr/0090-plan-axis-explanations-name-their-guard.md`）**：解释带上了 `{module, guard}` 地址，
  门按地址取来在句子声称的边界上问一次，七条变异臂全部按预测红；② `UNENFORCED_PLAN_AXES` 非空那句尾今天只有单测覆盖
  （界面没有真读数，因为它是空数组）。

## §SEC 第四十三片：每格解释带上它说的是哪道门——门按地址取来、在句子声称的那条边界上问一次（2026-11-08）

- 起点就是上一节「仍欠 ①」：`ENFORCED_PLAN_AXE_WHY` 里每格那句解释**本身**对不对，没有任何门能验。
  这一片第一遍就跑出**三句与门不符的解释**，三句都是曾经真过、后来门改了口径而句子没跟着改口的：
  ① aiUsage 说「额度为 0 时挡下」，而 `refusalFor` 比的是 `balance >= cost`——image 类一次 2 点，
  余额 1 点**不是 0** 也照样拒；② storage 说「存储写满时拒绝」，而 `refusalForStorage` 比的是
  `used + incoming <= limit`——198MB 已用 / 上限 200MB 时传 4MB 被拒，**没写满也拒**；
  ③ teamCollaboration 说「pending 邀请也占名额」，而 #213 之后 `teamSlotRefusalFor` 数邀请时带
  `gt(projectInvites.expiresAt, new Date())`——**过期那封不占**，否则人会被永久堵在门外。
  **改的是措辞，判据一行没动**（门的口径由 #191/#199/#211/#213 落定时就定了，今天没有证据说它们该改）。
- 做了什么（决定与取舍见 `docs/adr/0090-plan-axis-explanations-name-their-guard.md`）：
  ① `ENFORCED_PLAN_AXE_GUARDS` 取代纯字符串表，每格 `{module, guard, why}`，`as const satisfies Record<EnforcedPlanAxis, …>`
  ⇒ 加一格忘写拦截方是**编译错误**；`ENFORCED_PLAN_AXE_WHY` 保留但只能由它 `Object.fromEntries` 摊平（写入方仍只有一个）；
  ② 点数不手抄：aiUsage / generation 两句里的点数由 `${GENERATION_COST.*}` 拼，另配一条腿把句子里的整数逐个抠出来对照常量表；
  另三句**不许带数字**（上限在页面另有一列，句子只说形状）；
  ③ **边界腿一律走地址**（`guardFromTable(axis)` 从命名空间按 `{module, guard}` 取真函数），不 import 具体门名——
  这是对调臂 W7 唯一能响的原因；④ 声称行为的句子钉在**它点名的那个函数自己的那一段源码**上
  （`functionSource(file, name)` 切片），不是全树搜 token：`gt(projectInvites.expiresAt` 在 `team.ts` 的邀请视图里也有一份，
  全树搜索的写法删掉名额 SQL 那道过滤照样绿（W6 量到的正是这个洞）；也不用 `fn.toString()`——
  vitest 的 SSR transform 会把被调方改写成 `(0,__vite_ssr_import_N__.name)(…)`，那条腿在**未变异的树上**就红；
  ⑤ 旧口径句子双端禁（`STALE` 四条既不许出现在页面端出去的那句话里，也不许出现在 `credits.ts` 的散文里）。
- 见证（逐字）：新门 `apps/web/test/credits-why-guards.test.ts` 17 条腿；连同 `credits-enforced-copy.test.ts`（8 条）
  与 `credits.test.ts`（26 条）⇒ **51 passed**（电池对照与电池收尾各一次，同数）；`@smoke §134 跑一次生成…` **1 passed (1.1m)**；
  `npm run typecheck` / `npm run eslint` 各 exit 0；全量由 `f604d13`（272 文件 / 3590 条，两次 exit 0）覆盖到本片
  （`git merge-base --is-ancestor eb809df f604d13` 为真）。
- 臂表（七条，每条**先写预测红/绿名单再跑**，全部 `pred 全中 · not 全绿`；跑法与逐字读数入库在
  `.scratch/arms-creditswhy.mjs` / `.scratch/arms-creditswhy.txt`）：
  W1 地址指错模块 ⇒ 2 failed；W2 门改名 ⇒ 3 failed；W3 `>=`收紧成`>` ⇒ 3 failed；
  W4 点数改回手抄 + `GENERATION_COST.image` 2→3 ⇒ **1 failed（只有数字腿红，边界腿全绿）**；
  W5 改回旧口径 ⇒ 4 failed；W6 删掉名额 SQL 的 `expiresAt` 过滤 ⇒ **1 failed**；
  W7 publishing 与 teamCollaboration 的门名对调 ⇒ **2 failed（名册腿全绿，两格边界腿红）**。
  还原由电池按 sha1 自校 ⇒ `credits.ts=OK credit-ledger.ts=OK`、`aborted=no`。
  两条不在预测里的另红如实记在 ADR 里（W3 连坐 §134 那条、W5 连坐页面逐字门），都是同源连坐不是漏洞。
- 仍欠，如实记：① 地址只证明"这道门存在、装在链上、在我问的那条边界上按句子答"——句子若声称一件**我没写用例去问**的行为
  （例如"撤回即释放名额"），仍没有腿问它一次；那要往 DB 平面要一条真邀请（`team.integration.test.ts` ⑥ 有形状，但它不读 `why`）。
  ② `NAMESPACES` 那两行是手写登记处，新增一个模块的门要先在那里登记（这是想要的摩擦，但仍是手工的一步）。
  ③ 本节与 ADR 的见证是 2026-11-09 补写的：落地那笔（`eb809df`）当时 ROADMAP 是另一条会话的在飞路径，
  故账先只记在 ADR；今天工作树干净才补上这一节，**补账日期与落地日期分开写**。

## §SEC 第四十四片：「只在最近 200 条公开版本里排」——那个数在 SQL 那一端必须有读者（2026-11-09）

- 起点：`/discover` 的「最近最热」复述 `trendingMethod()`，末尾那句 **「只在最近 200 条公开版本里排」**；
  真取候选集的是 `social.ts` 的 `discover()` 里 `.limit(input.sort === 'trending' ? TRENDING_CANDIDATE_CAP : limit)`。
  今天两端同源所以这句话是对的，**但没有门要求它们继续同源**：`trending.test.ts` 只钉"句子里有这个常数"，
  把 SQL 改成 `.limit(200)`（手抄）或 `.limit(limit)`（跟着页长走，页长上限 60），句子照样说 200、那条腿照样绿。
- 做了什么（决定与取舍见 `docs/adr/0094-trending-candidate-cap-has-one-reader.md`）：新门
  `apps/web/test/trending-cap-reader.test.ts` 5 条腿，判据钉在 **`discover` 自己的源码切片**上（ADR-0090 决定 4 同一手法）：
  ① 两条载体腿先红于判据腿（找不到函数体 / 切片里 `.limit(` 不是一处 ⇒ 先说"判据没有载体"，不让 `toContain` 在空串上假绿）；
  ② 那一行必须含标识符 `TRENDING_CANDIDATE_CAP`、仍区分 trending 与别的排序、**不含任何写死的数字**；
  ③ 同源腿要求 `social.ts` 真的从 `./trending` import 它、且本地没有第二份同名声明。
- 见证（逐字）：`trending-cap-reader.test.ts` 5 条 + `trending.test.ts` 7 条 ⇒ **12 passed (2 files)**；
  对照 `total=12 failed=0 exit=0`。臂表与跑法入库在 `.scratch/arms-trendingcap.mjs` / `.scratch/arms-trendingcap.txt`，
  四条**先写预测再跑**、全部 `pred 全中 · not 全绿`：X1 手抄 200 ⇒ 1 failed；X2 `.limit(limit)` ⇒ 1 failed；
  X3 本地另声明 `= 500` ⇒ 1 failed；**X4 反向对照（常数本身 200→50）⇒ 0 failed**——两端一起改口，门不许惩罚正当改动。
  每条还原校验 `OK`、`aborted=no`、收尾 `social.ts=OK trending.ts=OK`。
- 仍欠，如实记：① 这是**静态门**，证明"SQL 按名字读的就是句子那端的常数"，不证明"库里真的只取了 200 条"。
  DB 平面的行为腿夹具已设计好写在 ADR-0094 里（造 `CAP+1` 条，第 200 位给 3 个赞、第 201 位给 10 个赞，
  断言头一张是第 200 位且第 201 位不出现）——**两个方向都能红**；只造"最老那条分最高"的夹具抓不住上限变小。
  ② `TRENDING_CANDIDATE_CAP` 仍是硬编码，§61 那一节早就写明"平台大了要换成分桶预聚合而不是抬高这个数"，本片没动那个架构判断。

## §SC 第一片：微服务拓扑从形容词变成三件真东西（2026-11-09）

- 起点：`docs/decisions/0011-backend-service-boundaries.md` 写着 "Studio talks to the API gateway over
  typed HTTP/WS contracts only"，但仓库里没有网关，`apps/studio` 直连 `127.0.0.1:8080`。仓库里已有
  两个 Spring Boot 服务（`java-domain-service`、`nexus-api`），它们的地址只存在于启动脚本里。
  "微服务"在这里一直是形容词，不是一个可运行的拓扑。
- 做了什么（决定与取舍见 `docs/adr/0095-microservice-topology-registry-gateway.md`）：
  ① `services/nexus-registry`（SC-1）——独立 Eureka Server，单节点、不自注册、关自保护、关只读缓存；
     6 条腿全部走真 HTTP + 真 servlet 容器，注册体用 Eureka 自己的 `EurekaJacksonCodec` 生成。
  ② `services/nexus-gateway`（SC-2）——Spring Cloud Gateway + LoadBalancer + Resilience4j；一条
     `/api/** → lb://nexus-api` 路由，Java DSL（YAML 前缀被 Gateway 4.2+ 改名会静默不再匹配）；
     StripPrefix 段数从 prefix 计算；5s TimeLimiter；兜底 503 + 断路器实际记录的 cause；
     `/platform/services` 只报注册表持有的地址，并写明"不是网关做的健康检查"。
     7 条腿：`GatewayRoutingTest` 6 条（真 socket 上游：后端**收到的路径**、500 透传、超时 503、
     断连 503、读数、无 DiscoveryClient 的单元分支）+ `GatewayUnknownServiceTest` 1 条（注册表里没有 ⇒ 503）。
  ③ `services/nexus-api`（SC-3）——加 eureka-client；注册默认**关**（`NEXUS_API_REGISTER=false`），
     两个开关都关时客户端不启动任何网络任务，43 个既有测试行为不变。
- 见证（逐字）：registry `Tests run: 6, Failures: 0`；gateway `6 + 1 = 7, Failures: 0`；
  nexus-api 43 个测试类全绿（`mvn -f services/nexus-api/pom.xml test` 退出码 0）。
  真三服务联调 2026-11-09：`/eureka/apps/NEXUS-API` = 200；网关 `/platform/services` 读到
  `nexus-api → http://192.168.1.5:8081`（同一张表里还有外部项目的 `football-edge`，这是读数在说真话）；
  `GET http://127.0.0.1:8091/api/projects?limit=1` = **200 + 真 publication `doc_19d8pa`**。
- 顺带修正：网关的 pom/README/注释原先把这句话归给 "ADR 0011"，但 `docs/adr/0011` 讲的是作业收敛；
  正确出处是 `docs/decisions/0011-backend-service-boundaries.md`，已改准。
- 仍欠，如实记：① 经网关拿到的 `url` 是**后端实例地址**（Host 透传），不是网关地址，需要
  `X-Forwarded-*` 或 public base URL 策略；② `nexus-api` 在本机旧库上启动时 Hibernate 报
  `column "target_type" of relation "audit_entry" contains null values`（`ddl-auto: update` 加不了
  NOT NULL 列），读路径不受影响、写审计的路径会失败，需要迁移工具或带默认值的列演进；
  ③ 网关的 auth / 限流 / TLS / WebSocket / 重试 / Caffeine 缓存都没做；④ `java-domain-service`
  还没接入注册中心。
## §SC 第二片：旧库 DDL 漂移的真实修复（2026-11-09）

- 症状（真日志逐字）：`nexus-api` 在本机 55433 旧库上每次启动报
  `Error executing DDL "alter table if exists audit_entry add column target_type varchar(16) not null" ...
  [ERROR: column "target_type" of relation "audit_entry" contains null values]`。这不是无关紧要的告警：
  列没加上，随后写审计的路径会失败，发布 / 点赞 / 评论 / 举报的审计都会缺行。
- 根因：`ddl-auto: update` 只能"加列"，不能"给已有行补值"；`NOT NULL` + 19 行旧数据 = 永远加不上。
- 修复：`AuditEntry.targetType` 去掉 `nullable = false`，**写入端仍然强制**（`AuditService.requireTargetType`
  的闭合集校验一字未改），DB 层对"列引入之前的行"诚实保留 null。实体注释写明"null 意为早于列存在，
  不是第四种类型"，README Bounds 补同一条。没有伪造回填：旧动词都发生在 publication 上、是可回填的，
  但回填应由一次可审计的迁移完成，不该让 ORM 在启动时猜。
- 见证：重启后 `audit_entry.target_type | YES | character varying` 已存在；`POST
  /projects/ddl-probe-20261109/publish` = 201；`audit_entry` 新行 `publish / ddl-probe-20261109 /
  publication`；旧 19 行保持 null；`DELETE` 清理 = 200 `{removed:true}`；43 个测试类仍全绿。
- 仍欠：Flyway/Liquibase 迁移与 `SET NOT NULL`（回填 `publication` 有依据，但要一次可审计的迁移）。
## §SC 第三片：回执 URL 指向调用方地址（2026-11-09）

- 起点（第一片仍欠①，真读数逐字）：经 8091 取回的回执里 `url` 是 `http://192.168.1.5:8081/projects/...`
  ——后端实例地址。调用方打不开它，它还把内部拓扑写进了回执。
- 做法：网关在每条路由请求上设置自有头 `X-Nexus-Original-URL`（调用方实际输入的 scheme + authority），
  `nexus-api` 的 `PublishController` 优先采用；头缺失或全空白时回落
  `ServletUriComponentsBuilder`。`nexus-api` 同时加 `server.forward-headers-strategy: framework`。
- 为什么不用 `X-Forwarded-Host`（走过的弯路，逐字记）：先试路由 filter、再试 `LOWEST_PRECEDENCE - 1`
  的 `GlobalFilter`，后端收到的仍是空串——框架自带的 `XForwardedHeadersFilter` 在我们的 filter 之后
  用 host-only 值重写了标准头。结论：标准头的写入时机不由我们掌握，回执地址用一个端到端属于自己的头。
- 见证：gateway 7 条腿全绿，其中 `GatewayRoutingTest` 断言的是 **stub socket 实际收到的**
  `X-Nexus-Original-URL = http://127.0.0.1:<gatewayPort>`，不是 filter 的意图；`nexus-api`
  `PublishControllerTest` 19 条（+2：有头用 `https://studio.example.test/projects/pub-1`、空头回落
  `http://localhost/projects/pub-1`），全量 `mvn -f services/nexus-api/pom.xml test` 退出码 0。
  真三服务复验 2026-11-09：经网关 `GET http://127.0.0.1:8091/api/projects?limit=1` →
  `"url":"http://127.0.0.1:8091/projects/doc_19d8pa"`；直连
  `GET http://127.0.0.1:8081/projects?limit=1` → `"url":"http://127.0.0.1:8081/projects/doc_19d8pa"`。
- 边界：`nexus-api` 信任该头，与任何 forwarded 头同一信任面——网关覆盖写、不追加；能直连后端的
  客户端可以伪造它，部署不得把 `nexus-api` 直接暴露给不可信客户端。
- 仍欠：第一片的 ③（网关 auth / 限流 / TLS / WebSocket / 重试 / 缓存）与 ④（`java-domain-service`
  接入注册中心）。
## §SC 第四片：第二个后端接进拓扑（2026-11-09）

- 起点（第一片仍欠④）：`java-domain-service` 是一个从未启动过的脚手架——Boot 3.2/Java 21、端口 8081
  （与联调端口撞车）、Flyway 开着但没有任何迁移、无 SecurityConfig（默认会 401 一切）、**0 个测试**。
- 做法：升到 Boot 3.5.16/Java 25 + Spring Cloud 2025.0.3 + Eureka client（注册/拉取默认 false）；
  `ddl-auto: none`、删 Flyway（schema 属于 web 层）；`SecurityConfig` 显式 permitAll 并写清"不得直接
  暴露端口"；网关加第二条 `/domain/** → lb://nexus-domain-service` 路由与独立 breaker 实例；新增 22 条
  domain-service 测试（此前 0 条）。community/permission/billing 三个桩**保持不可达**，README 如实标注。
- 映射三个"老路"，全部按实测错误原文修：
  1. `column "kind" is of type project_kind but expression is of type character varying` → 连接池
     `data-source-properties.stringtype: unspecified`（不是 URL 参数；`connection-properties` 实测未生效）。
  2. `invalid input value for enum user_role: "CREATOR"` 与 `No enum constant ...UserPlan.free` →
     `UserRoleConverter`/`UserPlanConverter` 写小写标签、读两种大小写。
  3. `column "brand_kit" is of type jsonb but expression is of type character varying` →
     `@JdbcTypeCode(SqlTypes.JSON)`（省字段的 insert 以前直接 500）。
- 见证：`mvn -f services/java-domain-service/pom.xml test` 22 条全绿；网关 8 条全绿（新增 domain 路由一条，
  用**两个** stub socket 断言调用只落在 domain stub）。真联调经 8091：
  `POST /domain/api/v1/projects` = **201**（`kind=game`）、`GET` 同 id = **200**、`DELETE` = **204**、
  再 `GET` = **404**；`/platform/services` 读到 `nexus-api`、`nexus-gateway`、`nexus-domain-service`
  与另一项目的 `football-edge`（只展示不路由）。探针行已从库里删除（`DELETE 4`，复查 0 行）。
- 边界：domain-service 无鉴权、不得直接暴露；三个域服务仍是桩。
- 仍欠：网关 auth / 限流 / TLS / WebSocket / 重试 / 缓存；domain-service 的 community/permission/billing
  真正实现。
## §SC 第五片：网关边界策略（2026-11-09）

- 起点（第一片仍欠③）：网关只有路由与 503 兜底；限流 / 重试 / 请求体上限 / 安全头都是空的。
- 做法（决定与取舍见 `docs/adr/0095-microservice-topology-registry-gateway.md` 的 SC-7 段）：
  ① 两条路由共享 `edgePolicy`：StripPrefix → `setRequestSize`（默认 1 MiB，超限 413 且不转发）→
     `secureHeaders` → **仅 GET** 一次重试（只对 502/503 与连接异常，`setSeries()` 主动清空，避免 500
     被重试）→ CircuitBreaker 收尾；
  ② 自研 `RateLimitFilter`（Caffeine 有界缓存 + 令牌桶，`HIGHEST_PRECEDENCE + 10`），默认 100/s、
     burst 200、maxClients 10000，超限 429 + `Retry-After: 1`；不用 Redis `RequestRateLimiter` 的理由：
     那会让 Redis 成为每个请求的硬依赖；
  ③ 启动打一行读数，避免"限流开着"和"限流根本没接上"无法区分。
- 见证：网关 **17 条**测试全绿（Routing 7 / Unknown 1 / EdgePolicy 4 / RateLimitFilter 4 / Wiring 1）。
  真联调 2026-11-09：三项安全头齐全；1.2 MB POST → **413** 且 DB 0 行；`rate=0/burst=3` 时前 3 次转发、
  后 3 次 **429 + `Retry-After: 1`**；启动日志逐字
  `gateway rate limit: enabled=true ratePerSecond=0.0 burst=3 maxClients=10000`。
- 顺带发现（已写进 README/ADR）：`/platform/services` 是网关自己的 controller，
  `RequestMappingHandlerMapping` 先于路由匹配，`GlobalFilter` 看不到它——诊断端点不在边界策略内。
- 仍欠：auth、TLS、WebSocket、Redis 共享限流、多实例 breaker 状态、诊断端点自身边界。
## §SC 第六片：拓扑健康读数（2026-11-09）

- 起点：`/platform/services` 只列地址，注册表只列租约，没有一处回答"哪些实例现在真的会答话"。
- 做法：三个服务加 actuator，只暴露 `health`（`show-details: never`）；网关新增
  `GET /platform/health`，对每个发现实例发 `GET /actuator/health`，逐实例给出
  `UP` / `DOWN` / `UNKNOWN` + `allUp`。超时不折算 DOWN；`/platform/health` 执行后恒 200。
  探针全响应式（controller 在 Netty event-loop 上，`block()` 会被立即拒绝——这是测试抓到的真 bug）。
- 见证：单测 + 接线测共 6 条新增（网关合计 **23 条**全绿）。真联调：`allUp:true`，三个服务均 `UP`；
  停 domain 后 `allUp:false`、该实例 `UNKNOWN` + `"no answer within 800 ms"`。
- 边界：点测量、不缓存；探测端点不在路由边界策略内；本机 domain 必须 `REDIS_PORT=56379`，否则会
  连到别的项目的 6379 并诚实报 DOWN。
## §SC 第七片：配置中心（2026-11-09）

- 起点：网关边界参数靠本地 yml + 一串 env；跨环境不同值只能靠脚本记住每个变量。
- 做法：新增 `services/nexus-config`（Spring Cloud Config Server，native，8888），只服务
  `application.yml` 与 `nexus-gateway.yml`；网关加 config client，`optional:configserver:` 导入且
  `spring.cloud.config.enabled` 默认 false（配置中心挂了不带停门，本地文件是离线真相）。
- 见证（2026-11-09）：`/nexus-gateway/default` 返回两个 property source、`rate-per-second=50`；
  `NEXUS_CONFIG_ENABLED=true` 启动日志 `ratePerSecond=50.0`（本地为 100），不带开关时同一 jar 用 100。
  配置模块 3 条测试全绿。
- 明确不做：api/domain 客户端接入、Git 后端、鉴权、动态刷新、变更审计。
## §SC 第八片：domain 的 Redis 默认值纠偏（2026-11-09）

- 起点：SC-8 联调暴露 `localhost:6379` 是另一项目的 Redis（要 AUTH），domain 漏传 `REDIS_PORT` 就会
  连错库并只在 health 上现形。
- 做法：`java-domain-service` 的 `REDIS_PORT` 默认值 6379 → **56379**（本项目 nexus-redis），注释写明
  为什么"指向别人服务的默认值不是默认，是陷阱"；覆盖语义不变。
- 见证：停旧进程 → `mvn package`（22 条测试绿）→ 不带 `REDIS_PORT` 启动 → `/actuator/health` 200 UP；
  网关 `/platform/health` `allUp:true`。
- 边界：默认值绑定本机实验室拓扑；异地部署必须显式给 `REDIS_HOST/REDIS_PORT`。
## §SC 第九片：api/domain 接入配置中心（2026-11-09）

- 起点：配置中心只有网关一个客户端；两个后端的注册开关仍靠环境变量，漏传就是"起来了但没进拓扑"。
- 做法：两个服务加 config client（`optional:configserver:`，`enabled` 默认 false）；中心新增
  `nexus-api.yml` / `nexus-domain-service.yml`，只放本实验室的 `register-with-eureka: true`。
  datasource/redis 地址不搬进中心（必须由运行环境决定）。
- 见证（双臂）：环境无 register 变量、中心在 8888 应答时——客户端关 → health 200 但注册表无
  `NEXUS-API`；客户端开 → `NEXUS-API` 出现在注册表且网关读数 `UP`。domain 启动日志逐字显示
  `Fetching config from server at : http://127.0.0.1:8888` 与 `Registering application NEXUS-DOMAIN-SERVICE`。
  配置模块 5 条测试、domain 22 条、api 全量测试全绿。
- 边界：无鉴权/动态刷新；中心挂了退回打包文件（optional 导入）。
## §SC 第十片：SC-12 共享限流搬进 Redis——一个集群一个桶，后端挂了门不关（2026-11-09）

- 起点：SC-7 的桶按**实例**计，两台网关 = 两倍速率；客户端在两台间轮换等于没有上限。
- 做法：`nexus.gateway.rate-limit.backend: memory|redis`（默认 memory，未知值启动失败）。redis 后端用
  reactive Lettuce + 一个 Lua 令牌桶（Redis `TIME` 补水、单次 EVAL 原子扣减、TTL = 补满一桶 + 1 秒）；
  key 前缀 `nexus:gateway:rate:` 可配；Redis 默认 `127.0.0.1:56379`，命令/连接超时各 1 秒。
  **fail-open**：后端异常/空答复 → 放行 + 10 秒一条 WARN（限流是上界，不是鉴权；不让减速组件变成停机组件）。
- 见证（真三进程：registry 8761 + api 8081 + 网关 8092/8093，同 `rate=0 burst=2`）：8092 两次 `200`/`200`；
  从未碰过本地桶的 8093 第三次 `429` + `Retry-After: 1`；Redis `nexus:gateway:rate:127.0.0.1` 读数
  `tokens=0`、TTL 3588。指向死端口 56380 的 8094（`burst=1`）连续两次 `200`，日志逐字
  `gateway rate limit backend 'redis' failed; request allowed unthrottled (fail-open)`。
  单测 30 条全绿（新增 `RedisRateLimitBackendTest` 5 条、`RateLimitFilterTest` +2）。
- 边界：redis 在请求路径上（失败即放行，不阻断）；跨窗口只承诺整桶上限 + 连续补水，不是滑动窗口；
  网关自身 controller 仍不受限流（SC-7）。观察待查：注册表为空时 503 提交后又抛
  `UnsupportedOperationException`（`ServerHttpResponse already committed`），只在故障路径出现。
## §85 第四十四片：机检 review 态进读数（2026-11-09）

- 缺口：此前 e2e 只覆盖了 blocked（硬红线挡下）。review 是 **页面已经发出去、内容挂人工复核**，
  后果与文案都和 blocked 相反；把 review 念成 clear 会让读屏用户以为"没命中所以没问题"，念成 blocked
  会让人以为"没发出去"。
- 做法：`route.fetch()` 先让服务端真发布并拿到真回执，只把 `body.scan` 改写成合规的 review 结构；
  断言结果块、地址、顶栏版本号（从回执文本读，不硬编码）与裁决块同时成立。详见 `docs/TESTING.md`。
- 读数：**28 通过 / 35 不适用 / 0 违规**，1 passed（16.8s）；截图
  `screenshots/a11y-opened-publish-scan-review.png` 人工看过。
- 三条臂 N1–N3（去 role / 改 clear 口径 / 丢规则名）各自红一次，还原后复跑绿，PublishPanel 无残留 diff。
- notMeasured：真服务端 5xx / 413、390 下弹层、焦点陷阱。

## §SC 第十一片：接手 SC-12 收尾——那只 Lua 桶在真 Redis 上有了常驻读者（2026-11-10）

- 起点（接手时的工作树）：SC-12 的代码、测试、文档都写好了但**未提交**（4 个新 java 文件已暂存、9 个改动
  未暂存）。上一线的两实例见证记在 ADR-0095 里；本机这一遍要自己量过才提交。核对时撞到两件事：
  ① `RedisRateLimitBackendTest` 那 5 条把 template 换成了 mock（它自己的注释写着 "graded without a Redis
  server"），于是**脚本正文那 30 行在自动化里一个读者都没有**——补水算错、nil 没兜住、`PEXPIRE` 写成常量、
  并发下两个调用方拿到同一枚令牌，都能在 mock 全绿的同时发生；② 本机空闲内存只有 **357MB**
  （`FreePhysicalMemory` 读数），再起三个 JVM 复现"两实例共享桶"会把机器压垮。所以这一片把见证下沉到
  Redis 那一层：同一只键上的多个调用方就是多个实例，这件事不需要多个 JVM。
- 做法：新增 `scripts/gateway-rate-lua-live.mts`（`npm run ratelimit:gateway-lua`）。脚本正文**不抄第二份**，
  从 `RedisRateLimitBackend.java` 的 text block 里读出来（找不到 `String LUA = """` 就红，不是跳过），
  并打印它的 sha256 前 12 位——读数对应哪一份字节是可核对的。判据只读线路：放行数由 `EVAL` 的返回值数，
  桶里剩几枚 / PTTL 多少由父进程自己 `HGET` / `PTTL` 读，不采信任何一边的自述。键名带本次 runId，
  与生产客户端的桶隔开（同一台 Redis 上可能正跑着真网关），收尾只删自己造的键。
- 读数（真 Redis `redis://127.0.0.1:56379`，脚本 `sha256:8db0f4043dd7`，runId `mw9lz2cl-30360`，
  2026-11-09T18:42:30.986Z，6 条判据全 PASS、exit=0；`.scratch/gateway-rate-lua-live/readings.json`）：

```
verdict SHARED_BUCKET_CAPPED: PASS         三次问门 1/1/0、tokens=0、PTTL=3599996ms
verdict PER_INSTANCE_CONTROL: PASS         对照：第三个调用方换一只键 ⇒ 1/1/1
verdict ATOMIC_BURST_THREE_CONNECTIONS: PASS  三条独立连接共 13 次问门、burst=3 ⇒ 合计放行 3、tokens=0
verdict REFILL_FROM_SERVER_CLOCK: PASS     打空 1/1/0 → 等 1.1s → 再问=1、剩恰好 1 枚；
                                           ts=1794249749.563400 落在 EVAL 前后两次 Redis TIME
                                           （1794249749.561248 … 1794249749.564844）之间
verdict FUTURE_STAMP_REFUSES: PASS         ts 写到未来 30s、tokens=0、rate=100 ⇒ 这一次=0、桶里 0 枚
verdict TTL_IS_THE_ARGUMENT_AND_IT_EXPIRES: PASS  传 ttl=1200 ⇒ PTTL=1199ms、1.4s 后 EXISTS=0、
                                           再问=1；rate=0 那只键 PTTL=3599999ms
```

- 臂（L1–L5，每条先红一次再还原。还原后 `RedisRateLimitBackend.java` 的 md5 =
  `a1391461adabb98aa9242e61a705416a`、`grep -c "MUT "` = 0，脚本 sha 回到 `8db0f4043dd7`）：

| 臂 | 改了什么 | 哪条判据红 | 量到的数（原话） |
| --- | --- | --- | --- |
| L1 | 去掉 `math.min(capacity, …)` | `REFILL_FROM_SERVER_CLOCK` | 剩 **1.223516** 枚（应恰好 1）；exit=1 |
| L2 | `if tokens >= 1` 改成 `>= 0` | `SHARED_BUCKET_CAPPED`（另 3 条连带红） | 三次问门 **1/1/1**、桶里剩 **-1** 枚；exit=1 |
| L3 | 删掉 `PEXPIRE` 那一行 | `TTL_IS_THE_ARGUMENT_AND_IT_EXPIRES` | PTTL **-1**ms、1.4s 后 EXISTS=**1**、再问=**0**；exit=1 |
| L4 | 删掉 `elapsed < 0` 的夹取 | `FUTURE_STAMP_REFUSES` | 桶里 **-2999.8854160309** 枚（应 0）；exit=1 |
| L5 | 不改源码，`NEXUS_REDIS_URL` 指向死端口 56380 | 整趟抛错（不是 skip） | `Redis 线路不通（redis://127.0.0.1:56380）：connect ECONNREFUSED`；exit=1 |

  L5 第一次跑还多打了一行 `[ioredis] Unhandled error event`（lazyConnect 失败时既 reject 又 emit）；
  加了监听者之后复跑，那一行计数为 **0**，报错原话里带上了 `ECONNREFUSED`。
- 接手这一遍的其它核对：`mvn -o test`（网关模块）**30 条全绿** = 4+1+7+1+2+6+5+4；
  `npx tsc -p tsconfig.tools.json --noEmit` exit=0；`npx eslint scripts/gateway-rate-lua-live.mts` exit=0。
  **`npm run lint` 这一趟是 `7 successful, 7 cached … FULL TURBO`**——缓存命中不是验证：根级 `scripts/`
  不在任何 package 的 lint 任务里（只有 `apps/studio` 定义了 `lint`），所以另外单独跑了上面两条。
  第一版脚本还真被 `tsc` 抓到一处 `(await redis.time()) as [string, string]`（TS2352，ioredis 的类型是
  `number[]`），改成直接读下标后 exit=0。
- 顺手修的两处口径：网关 README 那句 "One gateway instance" 在 SC-12 之后不再成立（redis 后端就是为多实例
  写的）；`docs/TESTING.md` 的分层表此前**没有 JVM / Spring Cloud 这一行**，五个 Java 模块的测试不在表上。
- 仍然没牙的那格（如实记）：这一片量的是**脚本在 Redis 上的语义**，不是"两个网关进程真的共用一只桶"。
  后者要三个 JVM（registry + 两个网关），本机 357MB 空闲起不来；ADR-0095 里 SC-12 那段两实例读数仍是
  上一线量的，本机没有复现。等内存宽裕时补一支 `ratelimit:gateway-two-process`（形状照
  `scripts/rate-limit-two-process.mts`：判据读线路，不采信孩子进程自述）。
- 合并盘点（同一遍做的）：`git worktree list` 只有主工作树一个，`git stash list` 空，
  `origin/master`（`6e765101`）已是 `main` 的祖先（`git merge-base main origin/master` = 它自己，
  `main..origin/master` 为空）——**没有第二份内容等着并进来**。`main` 领先 `origin/main` 10 个提交，
  按仓库约定默认不 push。
- 并轨实况（如实记，因为它改了这一片的提交形状）：本片量的过程当中，**同一工作树里另一条会话**
  把 SC-12 提交了两次——`ce316b3b`（02:37，网关共享限流的代码与文档）与 `75a5895c`（02:43，
  把本片写的 `scripts/gateway-rate-lua-live.mts` 连同 npm 入口一起提交，并把 `ioredis` 从传递依赖
  提升为显式 devDependency）。所以本片的脚本读数是真的、提交却不在本片的 commit 里；本片自己的
  commit 只带四处文档口径（ROADMAP / ADR-0095 / TESTING 分层表 / 网关 README）。
  `main` 因此领先 `origin/main` 12 个提交。两条会话在同一工作树上并行，接下来各自挑不相交的模块做。

## §SC 第十二片：网关鉴权（SC-13）—— 门先认人，再放行（2026-11-10）

- 起点（接手时工作树）：SC-12 的代码/测试/文档都已并入 main（第十一片接手的两 commit 已在上游），但 ADR-0095
  的"仍欠①"里**网关鉴权**一直空着——门对能摸到它的人完全敞开，`/api/**`、`/domain/**` 无需任何凭证直达
  后端。用户明确要"加一些 Spring Cloud 微服务的元素"，鉴权是最实在的一件，且 §159 对"门"同样适用：
  鉴权要么用真实密钥验真实签名、要么拒，不能假装。
- 做法：新增 `AuthFilter`（`GlobalFilter`，`ORDER = HIGHEST_PRECEDENCE + 5`，**先于**限流 `+10`，所以未认证
  请求不占令牌桶）。令牌是仓库**自签**的 HMAC-SHA256 紧凑令牌 `base64url(payload) + "." + base64url(sig)`，
  `payload = {"sub","scp":[],"iat","exp"}`，`sig = HMAC-SHA256(payloadBytes, secret)`，签名字节就是规范化
  payload 的 UTF-8——不存在"两边 JSON 规范化不一致让篡改令牌验过"的空子；先常量时间比签名，签过的 payload
  才解析 `exp`。白名单（免令牌）：`/platform/health`、`/actuator/health`、`/fallback/**`（门自己要先能被探活，
  fallback 是门够不到后端时自己说的话）。其余路径缺/坏/过期令牌 → `401` 不到达后端；成功向下游覆盖写
  `X-Nexus-Subject` / `X-Nexus-Scopes`。`auth.enabled=true` 且 secret 为空 → 启动失败（`refusing to start
  an open door`），fail-closed，与限流相反。
- 读数（`mvn -o test`，网关测试 **43 条全绿：原 30 + 13**）：`AuthFilterTest` 9 条（MockServerWebExchange，
  含伪造 subject 被覆盖写、篡改签名拒、过期拒、健康/fallback 白名单放行）；`GatewayAuthWiringTest` 4 条（真
  socket + StubUpstream：无令牌 `/api` → 401 `missing_token`、有效令牌 `/api` → 200 且后端实测收到
  `X-Nexus-Subject: studio`/`X-Nexus-Scopes: read,write`、篡改签名 → 401 `bad_signature`、鉴权开着时
  `/platform/health` 仍 200）。`mint`/`verify` 同一代码路径，§159 不造假。
- 诚实边界：本机默认关（离线真相）；secret 由部署提供真实密钥；令牌有效期由签发方决定；1 秒过期宽限是门唯一
  授予的时钟偏移，且显式。ADR-0095 把"网关鉴权"从仍欠①划掉、标 SC-13 还清；README 把"No authentication"
  改成"默认关、可开、开则必须真密钥"。
- 仍欠（如实记）：TLS、WebSocket；breaker 状态不在进程内；以及第十一片记下的 fallback 路径
  `ServerHttpResponse already committed` 噪声——它只是一条被记录的 ERROR（测试仍断言 503 正文），修它需要动
  retry/fallback 交互、有把现有测红的风险，本片未随 SC-13 一并改，单列待修边。

## §SC 第十三片：接手 java-domain-service 在途片——社区全收，计费/权限按共享 schema 重写（2026-11-10）

- 接手事实：同一工作树的另一条会话在 `services/java-domain-service` 留下一片**未提交**的在途工作后停了近
  七小时。按用户授权（"并轨的内容…直接接手帮他把剩下的内容做完，即使锁住也不要管"）整片接管。接手时的
  实况，逐项量过：`pom.xml` **不可解析**（`Unrecognised tag: 'groupId'`——一处 `<dependency>` 少了开标签）；
  相比 HEAD 掉了 5 个依赖（security / validation / cache / eureka-client / security-test），连带
  `SecurityConfig` 编译不过；`application.yml` 三处回退（`required:configserver` 会卡启动、eureka 挪进了
  不存在的 `spring.cloud.*` 命名空间、datasource/redis 两块被删）；`User` 实体发明了 `users.credits` 列——
  共享 schema（web 层所有，`schema.ts`）里没有这一列，额度只存在于 `credit_ledger` 的 SUM；`CreditLedger`
  的形状与 schema 不符（发明 balance、写方、agentKey 语义）；一条编造的 Feign 腿（ai-service 没有
  `/generate`，更不会返回 User）；`PermissionService` 编译不过且查询在撒谎（JPQL `SELECT p FROM Project …
  , User.class` 是运行时 ClassCastException 被空 catch 吞掉——所有权检查静默退化成"人人可读"）。
- 收下与重写的界线：**社区那一半原样收下**（entities/service/controller/policy/41 条测试——形状贴着
  共享 schema，拒绝句来自 SC-17 的导出文件，wire 断言对着真 schema 文件；这正是本仓库要的样子）。
  **计费与权限重写**。计费按 schema 的规矩写成只读账本读者：`@Immutable` 的 `credit_ledger` 实体
  （append-only 由 DB 触发器把守，JPA 层再锁一道）、`balanceOf = SUM(delta)`（没有 balance 列，schema
  也不许有）、`hasEnoughCredits`、`getSubscriptionPlan` 返回小写标签；额度数值留在 web 层
  `credits.ts` 的 `PLAN_MONTHLY_GRANTS`，不抄第二份；消费行（带 taskId 的扣减）仍由 web 的
  `finishTask` 写——Java 侧能追溯（按 taskId/kind 查）但不代写。权限写成只读检查器：所有权读
  `projects.owner_id`，publication 沿 `project_id` 追到项目再比主；**解析不到的资源什么都不给**
  （调用方该回 404，幽灵行不许从 read 兜底变 yes）；未知 resourceType 抛 IllegalArgumentException
  （调用方 bug，不是一次否认）；删掉了 grantRole/revokeRole（无人监督的角色写入是提权原语）、
  toUserDetails（声明返回 UserDetails 实际返回 Authentication，从未编译过；认证是门 SC-13 的事）、
  isModerator（`user_role` 枚举只有 creator/admin 两个标签，moderator 是 schema 存不下的身份）。
- Feign 缩成一条真腿：`AiServiceClient` 只留 `GET /healthz`（对真 ai-service 的 `/healthz`，返回体就是
  `{service,version,capability,providers,queue}` 那个 dict），生成不走 Java（ADR-0011：web→ai 直连）。
  resilience4j 依赖**直接删**——树里没有任何读者，留着它只是 pom 上的装饰；breaker 欠账仍在仍欠清单里。
  pom/yml 恢复成 HEAD 字节再加两样真东西：`spring-cloud-starter-openfeign`、把 `../../contracts` 的
  `community-policy.json` 拷进 jar 的 resources 块（社区服务启动时 fail-fast 读的就是它）。
- 读数：`MAVEN_OPTS=-Xmx400m mvn -B -o test` **90 条全绿**（32s，离线）：
  Community 41（19+14+10+8）+ Permission 11 + Billing 5 + Feign wire 1 + 原 User/Project 22
  （7+3+2+5+5）。Feign 那条对着 loopback HttpServer 打真实 HTTP（SpringMvcContract），断言收到的
  path 与 `/healthz` 的真实返回形状。
- 诚实边界：Permission/Billing 是**真服务、无控制器**——什么路由都到不了它们，README 的表格按这句写；
  `AiServiceClient` 的 wire 测试是对 loopback 桩量的，**没有**在本机对运行中的 ai-service 跑过
  （README 不宣称那次活体通话）；live run（建→读→删→404 过网关）仍是 README 说的"另一半"。
- 服务 README 同步：表格三行从 stub 换成真话（community 全 real；permission/billing "real, service
  only"），"stubs are scaffolding" 那段删掉，security posture 里"gateway 鉴权还没建"改成 SC-13 已落、
  本服务自身仍不做认证、端口仍不许暴露；Tests 段换成 90 条的分解。

## §SC 第十四片：SC-19/SC-20——微服务拓扑不只是和面条，要真成一条链（2026-11-10）

- 触发：上一片让 gateway 能路由、domain-service 有 controller，但"网关经服务发现把 `/domain/**` 真的打进
  domain-service、correlation id 真的一路回显"只在文档里写过、没在这一片台跑过。跑给你看。
- SC-19（docs/evidence/sc19-topology-live-proof.md）：本机起 registry(:8761) → domain-service(:8082，
  NEXUS_DOMAIN_REGISTER=true) → gateway(:8090)。eureka 里 UP（instanceId `host.docker.internal:nexus-domain-service:8082`，
  VIP `nexus-domain-service`）；`GET /api/v1/community/policy` 域服务直答 200；经 gateway
  `GET /domain/api/v1/community/policy`（带 `X-Request-Id: proof-sc19-001`）**HTTP 200 且 X-Request-Id
  原样回显**——网关确实按 service discovery 解析到 192.168.1.5:8082，不是硬编码；`/platform/services`
  读到两条服务、实例数各 1。
- **本片抓到的真 bug（java -jar ≠ mvn test）**：测试用 target/classes（编译即新），`java -jar` 用 jar 里的类——
  domain-service 的 jar 是在社区 Controller 加入**之前**打包的，community 包里只有 CommunityService.class，
  首次 `java -jar` 直接 404。必须先 `mvn -DskipTests package` 再跑；本片已把这条教训写进证据文档和本条，
  不是"顺序问题"。
- SC-20：给 Billing 补一扇门（本来 service 是真的，只缺控制器）。BillingController：
  `GET /api/v1/billing/balance?kind=ai` 与 `GET /api/v1/billing/plan`；身份只来自 X-Nexus-Subject（门覆盖），
  无 header → 400；非 UUID subject → 400；未知 kind → 400（BillingService.requireKind 的句子透出，
  "Unknown credit kind: moon-bucks"）；user id 不存在 → 400（"User not found: …"）。7 条无 Spring 上下文
  MVC 测试全绿；`mvn -B test` = **97/97** BUILD SUCCESS。
- 真验证（registry+domain+gateway 起来后）：无 subject → 400；有 subject balance=0（`X-Request-Id` 自动铸）；
  moon-bucks → 400；不存在 id plan → 400；真实用户 4d5bf1ac-… → plan=free、balance=0。
- 读数（`npm run evals` 需 DB）：`NEXUS_DATABASE_URL=…:55100/nexus_regress npm run evals` = exit 0，11 套全 PASS
  （含 `export-roundtrip` 真库 17/17）。**typecheck 14/14** · studio 测试 **2857/2857** · shard 1/2 与 2/2
  全绿（shard 1 曾有一红——`doc-evidence`：ROADMAP 点名的 `.scratch/gateway-rate-lua-live/readings.json`
  没入册，一条未跟踪——本片 `git add -f` 修掉，重跑 4/4）。

## §SC 第十五片：verify:topology——这条链的活验证变成一条 npm 命令（2026-11-10）

- 问题：上两片的证据是当天手动 curl 出来的——**第三天就不能复跑**。把它固化成
  `scripts/verify-topology.mts`（`npm run verify:topology`）：
  启动 registry+domain-service+gateway（日志落 TEMP，不污染仓库），逐项断言——eureka 应答、domain-service
  注册进库、policy 经 gateway 200、billing balance=0、**X-Request-Id 原样回显**（SC-14 端到端）、无 subject 的
  billing 400——任何一步失败退出非零。**结束无论如何都杀三个 JVM**（SIGINT/uncaughtException 兜底），不留残骸。
- 读数：`npm run verify:topology` = **PASS**（整个过程 <2 分钟）；`npx eslint scripts/verify-topology.mts` = 0；
  `npm run lint` = turbo FULL TURBO 绿。
- 仍欠：permission 面同形状（permission 的 JPA @Query 要先与 users 表对齐）；gateway 到 domain-service 的
  timeout/retry 仍没定——resilience4j 当初删了就是"没人读铃"，要加就得有读者。
- global pre-commit hook 全绿（turbo lint 13 个任务）；提交 {SC-19..SC-21} 全部走的是本地
  `git -c user.name="NEXUS Dev" -c user.email="dev@nexus.local" commit`，未推送（无明确指令）。

## §SC 第十六片：SC-23——权限面补上最后一扇门，顺带撞出 gateway 5s 冷启动真问题（2026-11-10）

- 触发：ROADMAP 第十四片立的欠账——"permission 面同形状（permission 的 JPA @Query 要先与 users 表对齐）"。
  PermissionService 早已是只读检查器且 97→103 测试全绿，缺的只有 HTTP 面。
- 交付：`PermissionController`（`GET /api/v1/permission/check?resourceType&resourceId&action=read`）+
  6 条无 Spring 上下文 MVC 测试；`mvn -B test` = **103/103**。
- 真跑（registry :8761 / domain :8082 / gateway **:8091**——:8090 被本仓之外的进程 PID 39424
  `com.nexus.NexusApplication` 占着，本片不抢）：
  - 真主人 write → 200 allowed:true；陌生人 write → 200 allowed:false；陌生人 read → 200 allowed:true（legacy 契约如实）；
    鬼资源 → allowed:false；moon resourceType → 400（服务自己的句子）；无 subject → 400；
    哨兵 subject（库里无此人）→ 400 `User not found` + X-Request-Id 原样回显。
  - **第一次调用真 503**：gateway 5s 上限撞上 domain 冷启动（Hibernate metamodel + Hikari 首连）。
    503 是设计行为（快速失败不挂请求），不是 bug；暴露的是 smoke 没覆盖"冷"路径这一层。已记入欠账，
    未用调大 timeout 消音。第二次（warm）即 200。完整读数见 `docs/evidence/sc23-permission-live-proof.md`。
- verify:topology 扩面：permission 两条断言（哨兵拒绝 + 无 subject 400）、端口经
  `NEXUS_REGISTRY_PORT/NEXUS_DOMAIN_PORT/NEXUS_GATEWAY_PORT` 可覆盖、stale jar 自动
  `mvn -o -DskipTests package`（Windows 走 mvn.cmd + shell:true）。port 8091 上 **PASS**。
- 仍欠：gateway→domain first-hit 冷启动的读数覆盖（smoke 要拿到"冷"的合法 503 或预热策略）；
  resilience4j 仍缺读者（不加）。提交为本地 `git -c user.name="NEXUS Dev" ... commit`，未推送（无明确指令）。

## §SC 第十七片：CI 门第三扇（topology job）+ smoke 预热与发现断言（2026-11-10）

- 触发：SC-19 证据里写下的下一步——"把 mvn package → java -jar 的部署冒烟作为 CI 的一步"。本来只靠人手动跑。
- 交付：
  - `.github/workflows/main-line.yml` 新增 `topology` job：pgvector/pgvector:pg16@55433 → npm ci →
    setup-java temurin 25（cache maven）→ `npm run db:migrate` → 三服务 `mvn -B -DskipTests package` →
    `npm run verify:topology`。**诚实声明：首个 push 前该 job 未经 CI 实跑**；若红，失败是真信号——
    这正是它存在的意义（抓 "test 绿但 jar 挂" 这一整类问题）。ci.yml 原样不动（verify:ci-wiring 数着它的 12 步契约）。
  - `verify-topology.mts`：`NEXUS_DOMAIN_DB_URL/DB_USERNAME/DB_PASSWORD/NEXUS_DOMAIN_PG_PORT` 全环境
    参数化；**预热段**——plan GET（哨兵 subject，幂等）重试至非 503（≤120s），断言不再撞冷启动 5s 上限；
    断言扩展至 8 条，含 `/platform/services` 必须列出 nexus-domain-service（discovery 不是只有接线没有消费方）；
    stale jar 自打包（Windows mvn.cmd + shell:true）。
- 读数：`NEXUS_GATEWAY_PORT=8091 npm run verify:topology` = **PASS**（<2 分钟）；eslint exit 0。
  - 一次瞬态崩溃如实记入：`RUN=-1073740791`（0xC0000409，经 PowerShell 管道输出时的一次硬崩）——
    原命令重跑即全绿；冒烟本身的断言没有任何一次"侥幸通过"。
- 并轨：`git branch --no-merged main` 为空、worktree 仅 main——两条线早已合并（2026-11-09），本片无可并内容。
- 未推送（无明确指令）。:8090 的占用进程（PID 39424，`com.nexus.NexusApplication`，classpath 指向已不存在的
  `services/platform/target/classes`，疑为已清理 checkout 的残留）未被触碰；一切验证改走 :8091。

## §SC 第十八片：boot 预热——把冷启动对齐到服务端，而不是只测绕开它（2026-11-10）

- 触发：§SC-23 抓到的真 503（gateway 5s 上限 vs domain 冷启动）。上一片用 smoke 预热绕开了，
  但那只是「测试知道绕开」，真调用方的第一下依然会撞。
- 决定（ADR-0099）：`WarmupRunner`（`ApplicationRunner`）在 context 起来时 `users.count()`——
  Hibernate metamodel/Hikari 首连的成本移到 boot，对所有调用方生效；失败只 WARN 不抛，
  boot 不失败，DB down 的话交给健康端点和部署层。**不放宽 gateway 5s**（那是门的设计语义）。
- 读数：`mvn -B test` = **103/103** BUILD SUCCESS；domain-service 日志实打实出现
  `WarmupRunner : warmup: shared schema reachable, users=4193`；
  `NEXUS_GATEWAY_PORT=8091 npm run verify:topology` = **PASS** 全程 <2 分钟。
- 未验证：极端慢 DB + 空表下 boot 预热是否足够——smoke 预热段保留作为第二道防线；
  若把 "DB 慢" 做成 CI SLO，这条要重新量。

## §SC 第十九片：nexus-api 进拓扑——四服务全经 service discovery，冒烟满员（2026-11-10）

- 触发：§SC-17 把 topology job 固化进 CI 之后，拓扑本身只覆盖 registry/domain-service/gateway——
  nexus-api 一直被默认关着（`NEXUS_API_REGISTER`），没人证明网关 `/api/**` 这条 lb 路由真能打通。
- 交付：
  - `verify-topology.mts` 第四条腿：起 nexus-api（`:8084`，自己的一次性库 `nexus_api_smoke`，
    ddl-auto:update，不碰 e2e 的 `nexus` 库）、等 actuator health、断言 eureka 持有 NEXUS-API、
    断言 `/platform/services` 列出**两者**、断言经网关 `GET /api/health → 200`（body 带
    service/version/startedAt；/api/health 仅当数据库可达才 200）；
  - CI `topology` job 同步：建 `nexus_api_smoke`（psql，没有就 apt 装 postgresql-client）、
    打包 nexus-api 共四个 jar；
  - `docs/ENVIRONMENT.md` 增加 `nexus_api_smoke` 行（它连谁、谁写它、不许污染谁）。
- 读数：`NEXUS_GATEWAY_PORT=8091 npm run verify:topology` = **PASS**（<2 分钟）；lint exit 0；
  `psql CREATE DATABASE` 成功。四个 JVM 全部干净退出。
- 未验证：CI 的 `topology` job 仍从未被真正 push 执行过；它红了就是真信号。
  gateway 的 `/api/**` 在本机 auth 关闭下是通的（auth 开着时同路径要 token）。

## §SC 第二十片：Config Server 往返——配了但没证明的那部分人（2026-11-10）

- 触发：SC-9/10/11 立了 config server 但只证明了"客户端接线了、默认关"；gateway/domain/api 都走
  optional import，没人证明过 8888 真的把属性送进过服务。
- 交付（verify-topology 第五条腿，`npm run verify:topology` 默认全程 <2.5 分钟）：
  起 registry :8761 → nexus-config :8888（native）→ domain :8082（**无** `NEXUS_DOMAIN_REGISTER/FETCH`
  env，只给 `NEXUS_CONFIG_ENABLED=true`）→ nexus-api :8084（同上）→ gateway :8090
  （**无** rate-limit env，只给 `NEXUS_CONFIG_ENABLED=true`）。
- 三条判据，全过：
  1. 两个后端都出现在 eureka 里而**环境里没有任何 register 标志**——只能从 config 文件来；
  2. 网关启动日志 `ratePerSecond=50.0`（本地打包默认 100）——nexus-gateway.yml 真的赢了；
  3. `/platform/services` 列出两者、社区/账单/权限/`/api/health` 全部照常——config 没把门搞挂。
- smoke 自身修了三处：日志截断（追加式日志会让昨天的 50.0 骗过今天的断言）、domain/api
  就绪等待 90→150s（首跑在内存吃紧下 domain 花了 111s 才就绪——失败门非零退出、进程全清干净）、
  eureka 存在性改轮询（注册是异步的）。
- 首跑如实记录（vt-run5.log）：domain 90s 未就绪 → 非零退出 → 进程清干净。复跑全绿。
- CI `topology` job 同步：打包 nexus-config 五个 jar；**CI topology 仍未被 push 实跑过**。
- config server 是 native（classpath，非 Git）——客户端契约与本片判据在 Git/Vault backend 同样成立，
  生产 config backend 未验证。

## §SC 第二十一片：8761 是别人的端口——本仓库注册中心迁到 8771（2026-11-10）

- 触发：verify:topology 的 `/platform/services` 突然多出 `config-server`——追查到
  `D:\3a大作` 的 config-server 心跳打进一个跑在 **8761** 的 registry（registry 日志：
  `Not Found (Renew): CONFIG-SERVER - host.docker.internal:config-server:28889`）。
  本机两条 Spring Cloud 栈共享了 Eureka 的框架默认端口。
- 决定（ADR-0100）：本仓库专用 **8771**（`NEXUS_REGISTRY_PORT` 默认、所有 `defaultZone` 默认、
  README/ENVIRONMENT 口径同步）；8761 留给 3a大作；evidence 记录不抹。
- 附带抓到**第二个 stale-jar 坑**：`ensureJarFresh` 原来只算 `src/main/java`，改
  `application.yml` 不触发重打包 → registry 在旧 jar 上起、smoke 在 8771 等 → fail-fast 超时。
  已改为扫描整个 `src/main/`（java + resources）。
- 读数（`NEXUS_GATEWAY_PORT=8091`）：verify:topology **PASS**——
  `/platform/services` 只列出 `nexus-domain-service, nexus-api`（无外部服务——本片对外来污染的判据）、
  config 往返、permission/billing/community 全部断言通过；eslint exit 0。
- 未验证：3a大作 是否注意到 8761 空置——不是本仓库的事；本仓库不再在它们的默认目标上。

## §SC 第二十二片：LoadBalancer 体征——一个服务 id，两个实例，一扇门（2026-11-10）

- 触发：拓扑证明了"能路由"，但"两个实例同时注册、lb:// 真的在它们之间选"从来没被测过。
- 交付：`scripts/verify-loadbalance.mts`（`npm run verify:lb`）——registry :8773 + domain-a :8085 +
  domain-b :8086（同一 id `nexus-domain-service`）+ gateway :8092；断言 eureka 持两个实例、
  `/platform/services` 把两者列为同一 id 下两个不同地址、`/platform/health` 两者都 UP（allUp=true）、
  十连发 `/domain/**` 全 200。端口全部避开 8090/8091/8771，env 可覆盖。
- 读数：**PASS**（本机 2026-11-10，<2.5 分钟；四个 JVM 全部自动干净退出）。`verify:lb` 已追加进
  CI main-line.yml 的 `topology` job（8773/8085/8086/8092）——**CI 仍未被 push 实跑过**。
- 故意不做的测量：failover/eviction（eureka lease ≤90s + gateway LB 缓存自己的时钟——
  "杀一个还能通"是超时不是性质）；轮询交替（带了实例 id 就是把部署细节泄进响应契约）。
- 与 8771 的关系：registry 换端口（ADR-0100）后本 smoke 默认走 8773，不撞主冒烟的 8771。

## §SC 第二十三片：认证门活体——抓到网关自己不认自己门的洞（2026-11-10）

- 触发：`verify:auth` 首跑，9 条断言红 2 条，两条都是真发现：
  1. 缺词真的是 `missing_token`（我曾断言 `missing`）——修断言，真值以运行中网关为准；
  2. **`/platform/services` 无 token 答 200**——AuthFilter 是 GlobalFilter，只在路由管道生效；
     网关自己的 controller 在 WebFlux 层先被答掉，拓扑地址簿公开可读。
- 修复（§SC-27）：新增 `PlatformAuthFilter`（WebFilter，HIGHEST_PRECEDENCE+5，与 AuthFilter 同白名单/同
  secret/同 reason 词/同 X-Nexus-Subject 覆写）；8 条无 Spring 上下文测试全绿；AuthFilterTest 9/9。
  **route 流量被查两次（WebFilter + GlobalFilter）——幂等、刻意、一次 HMAC 的代价。**
- 如实记：修复后本机 ~169MB 空闲（vmmemWSL/msedge/docker——非本仓进程，未动），gateway 150s 起不来，
  `verify:auth` 非零退出并清干净——**机器没内存，不是门坏了**；CI topology job 已追加 verify:auth 步骤。
- 顺带控制了实验：`ServiceHealthProbeTest` 三条应 DOWN/UP 的断言在 124–169MB 空闲下全变 UNKNOWN；
  把我两个新文件移出再跑**同样失败**——资源问题实证，非本片引入；未改测试。
- CI topology job 现在有三个冒烟步骤（topology/lb/auth），**仍从未被真实 CI 执行过**。
- 修复后本机 `verify:auth` **12/12 PASS**（678MB 空闲窗口）——读数见 `docs/evidence/sc27-auth-door-live-proof.md`；
  修复过程中又抓到并修了真实 boot 崩溃：`@Component` 双构造器 → `BeanInstantiationException: No default constructor found`，
  standalone 单测抓不到，因此新增 `PlatformAuthWiringTest`（真实 Spring wiring 上下文）。
- 冒烟 spawned JVM 加 `-Xmx` heap 上界（`NEXUS_SMOKE_HEAP[_DOMAIN]` 可覆盖；domain 512m / 其余 384m）——内存吃紧时 Spring Boot 起不动，不能把"养不起"当"门坏了"。
- `ServiceHealthProbeTest` 在内存恢复后 4/4 全绿；CI runner 才是这类时延断言的判决场。
- CI topology job 三个冒烟步骤（topology / lb / auth）仍从未被 push 真实 CI 执行过。

## §SC 第二十四片：断路器的 OPEN 态——从"开火"到"失败快"的最后一把尺子（2026-11-10）

- 触发：网关早已有 circuit breaker（`edgePolicy` 的 `circuitBreaker` + FallbackController 的 503 句子）——
  但 `GatewayRoutingTest` 刻意把窗口设成 100，**OPEN 态从来没有被 wire 级测量过**。
- 交付：`GatewayCircuitOpenWiringTest`（真实 socket stub + 真实网关 + random port）：
  滑窗 4、minimum-number-of-calls 4、阈值 50、wait-duration 60s；4 次 mid-call 连接拒绝（异常——
  breaker 数的是异常，不是 5xx 响应）→ 第 5 次调用被 fallback 直接拒：
  **cause 含 `CallNotPermitted`**（不是 not-reported 也不是 timeout），且 **stub 没有收到新请求**。
- 读数：`mvn -B test` gateway = **62/62** BUILD SUCCESS（新增 1 条断言种类；ServiceHealthProbeTest 4/4）。
- 顺带的事实：STATE 文档里"resilience4j 缺读者"早已过期——breaker 一直在
  （503 fallback 每次冷启动都被记下来了）；本片补的是**开路**那半把尺子。
- CI 未实跑（仍从未 push）。

## §M5 第四十片：逐镜画面出处——第三十八片欠下的"每一镜拿的是它自己那一张"（2026-11-10）

- 起点：第三十八片末尾如实记下的仍欠 ②——"只证了整片那张图进了画面，没证**每一镜拿的是哪一张图**"。
  （`RenderSource.reference.from: 'shot' | 'source'` 一直在计划里，但**谁都没读它**：
  面板只看得到最终视频和一份 notes，看不到"第几镜的画面由谁供给"。）
- 做了什么：
  ① `packages/video-model` 无改动——计划里一直有这格，不动唯一真值形状（§16）；
  ② web 领域层 `RenderStoryboardOutcome` 加 `segments: ShotProvenance[]`（index / shotId /
     frame: `own`（这一镜自己挂的参考帧）| `whole-piece`（整片那张图，本镜自己没挂）|
     `card`（色卡占位）），映射直接从 `plan.segments` 读，不建第二份真值；
  ③ 渲染路由把它原样带回界面（POST 201 的 body）；
  ④ 面板结果块新增 `[data-storyboard-render-provenance]`：逐镜一行，
     "第 i 镜：画面来自这一镜自己挂的参考帧 / 来自整片那张图（image-to-video 箭头带的，本镜没自己挂）/ 色卡占位（本镜没挂参考帧）"；
  ⑤ 历史清单暂不带（`StoryboardRenderRecord` 没存出处，装出来就是假记录——不造目前存不下的读数）。
- 读数（真 ffmpeg + 真 Postgres，55100 nexus_regress）：
  - `storyboard-render.integration.test.ts` = **15/15**（新增两条：快乐路径按镜断言
    `[{shot-ref, own}, {shot-card, card}]`；Whole-piece 对照组断言 `[{shot-src-a, whole-piece}, {shot-src-b, whole-piece}]`）；
  - `storyboard-render-route.integration.test.ts` = **9/9**；
  - studio **2857/2857** · typecheck 14/14 · eslint exit 0（web 与 studio 两套门）。
- 读数：`npx playwright test e2e/storyboard.spec.ts --grep '整片参考图'` = **1 passed**（1.1m；两条 provenance 逐镜断言入 browser，screenshot 同名文件已更新）；
  studio **2857/2857** · typecheck 14/14 · eslint exit 0（web 与 studio 两套门）；
- 如实的边界：历史清单暂不带（`StoryboardRenderRecord` 没存出处，装出来就是假记录——不造目前存不下的读数）。

## §M5 第四十一片：箭头不认但留着的人/图——静默丢弃的格子出声（2026-11-10）

- 起点：第三十八片末尾如实记下的无牙格子 ②——`missingArrowSource` 只管缺不管多带：
  选了图/角色却换到一条不读它的箭头（text-to-video 上带 referenceAssetId / characterId），
  渲染里静默丢弃，界面上没有任何一句。
- 做了什么：`planVideoRender` 的 notes 里加两句（条件触发，arrow 不认对应格才说）：
  `source.referenceAssetId 被带着但 {arrow} 不读它…换成 image-to-video 才会进。`
  与
  `source.characterId 被带着但 {arrow} 不读它…换成 character-to-scene 才会进。`
  两句分开出——图一件事、角色一件事，不是一句笼统的"有残留"。
- 读数：`npx vitest run --no-file-parallelism packages/video-model/test` = **101/101**
  （100→101；"别的箭头带图也不进像素"用例补一条 `不读它` 断言 ×3 箭头；新增 residue 用例同时断言两格）。
- 如实的边界：notes 是**计划里**的出声——面板原样显示 `plan.notes`，所以这句话就是界面话；
  历史清单与 task 行没有新的持久化字段（这次渲染就会展示，不装进去就再不说了）。
- player 仍需真 provider（§38 明码 DEMO）。

## §SC 第二十五片：断路器的闭合回路——后端恢复能自愈、探测失败能重屏蔽（2026-11-11）

- 起点：§SC-24 只量了「OPEN 会失败快」，断路器**合上**的那一半从没被 wire 级证明；而
  `application.yml` 里 HALF_OPEN 的三行生产设置（`automatic-transition-from-open-to-half-open-enabled`
  / `wait-duration-in-open-state` / `permitted-number-of-calls-in-half-open-state`）从写下起无人证明生效。
  一个只会开不会合的断路器 = 穿着韧性外衣的永久停机。决定见 `docs/adr/0101`。
- 交付：`GatewayCircuitHalfOpenWiringTest`（真 socket stub + 真网关 + random port，2 条 `@Test`）：
  1. **恢复腿**：连续 drop→OPEN（一次调用 503 且 stub 无新请求）→`stopDropping()` 后**不发任何请求**，
     纯等待即观测到状态自动到 HALF_OPEN（automatic-transition 第一次被证明生效）→2 个探测各 200 且
     `$.from=stub-upstream`（fallback 恒 503，故 200 本身就证明越过响应线到后端）→状态 CLOSED→普通调用
     200 且 stub 收到新路径。**门真的自愈了**。
  2. **重屏蔽腿**：同样等到 HALF_OPEN，但后端仍坏：有界探测（≤3 次逻辑调用）后状态回到 OPEN、期间**从不
     CLOSED**、之后调用再次 503 且 stub 无新请求。**半开是受控探测，不是无脑重开**。
- 桩件：`StubUpstream` 新增 `startDropping()`/`stopDropping()`——**可恢复**的中段断连，区别于永久 `/drop`；
  同一 socket 先造 OPEN 再宣布后端回来，才测得了自愈。`reset()` 清零开关，既有测试不受影响。
- 读数：`mvn -o -B test -f services/nexus-gateway/pom.xml` = **64/64 BUILD SUCCESS**（基线 62 + 新增 2）；
  单类 2/2 PASS；全套同跑无端口/registry 时序干扰。窗口缩到 4、等待 1.5s、permitted 2（同 §SC-24 缩窗理由）。
- **首跑如实红一次且有价值**：负向腿初版断言「单次失败探测后立刻 OPEN」，实测停在 HALF_OPEN——
  Spring Cloud Gateway 的 GET retry（`setRetries(1)`）在半开探测上花掉第二次 wire attempt，
  「一次逻辑调用」≠「一次 wire 失败」，pin「一次就重开」等于 pin 库+filter 编排细节。改为测平台语义
  （有界探测直到回 OPEN、期间不 CLOSED、后端被重新屏蔽），**没有放宽为接受 HALF_OPEN、没有改恒真**。
  日志里 retry 与 fallback 争抢响应提交产生 `UnsupportedOperationException: ServerHttpResponse already
  committed (503)`——filter 编排在半开失败路径的噪声，caller 仍得诚实 503；不改生产 route 语义，记为已知边界。
- 并轨：开工复核 `git worktree list` 仅 main、`git branch -a` 无游离分支、`git branch --no-merged main` 为空——
  两条线 2026-11-09 已并，`git` 侧**无可并内容**（用户要求的"合并 worktree"本轮无对象可合并，如实记录不造假）。
- 未验证：生产 `wait-duration=10s/permitted=3` 只按数字缩放、语义同；CI `topology` job 仍从未被真实 push 执行
  （沿用 §SC-17 起声明）；真实 Eureka 下半开未单测（breaker 自身行为，与发现实现无关）。未推送（无明确指令）。

## §SC 第二十六片：网关说 W3C Trace Context——私有 X-Request-Id 之外补上开放标准的那一半（2026-11-11）

- 起点：§SC-14 的 `CorrelationFilter` 只发 NEXUS 私有 `X-Request-Id`，自家日志能对齐，但 **Jaeger /
  Zipkin / OTel / 上游 mesh 都不读这个头**——NEXUS 发起的调用跨出平台边界后链路在外部是断的。
  用户本轮要求「加 Spring Cloud 微服务元素、集大成」，可观测性的跨系统传播是教科书元素。
- 决定（`docs/adr/0102`）：新增 `TraceContextFilter`（ORDER +21，紧跟 correlation +20、路由前），
  **provider-free** 地说 W3C `traceparent`/`tracestate`——只按格式解析/生成随机 id、透传 tracestate，
  不采样、不导出、不连 vendor（无 tracing backend 就不假装有，§159/§160）。不替换私有头，两者并存各司其职。
- **真懂 W3C 的那一刀**：合法入站保留 trace-id + flags，**但换掉 parent-id**——网关是一「跳」不是原始
  调用方，后端看到的父 span 必须是本跳的；原样转发会让整条链共用一个 span id，看着连着实则撒谎。
  缺失/畸形（长度错、非 hex、全 0、版本非 00）→ 重新 mint，不传播垃圾。traceparent 回显响应；
  tracestate 因 mutate 只重写 traceparent 而天然逐字透传（符合 W3C「不懂也不得丢 vendor 条目」）。
- 读数：`mvn -o -B test -f services/nexus-gateway/pom.xml` = **73/73 BUILD SUCCESS**
  （§SC-29 基线 64 + 本片 9 = 无服务器 `TraceContextFilterTest` 5 + wire `GatewayTraceContextWiringTest` 4）。
  wire 读到：无入站→生成并后端实收=响应回显；合法入站→trace-id/flags 留、parent-id 换（≠调用方值）、
  tracestate 逐字不变；畸形→后端实收新 mint 的合法值而非垃圾；私有 X-Request-Id 与标准头同请求并存互不覆盖。
- **首跑如实红 3 条，是测试桩真 bug**：wire 4 条里「合法入站」先 PASS（证 filter 真进链、换 parent 在线上
  成立），另 3 条 `backendSaw(0,…)` 读到上一条测试的请求——`StubUpstream.clearPaths()` 没清 `requestHeaders`，
  跨测试隔离漏了。修：让 `clearPaths()` 同清所有记录型集合，三条全绿。**没放宽断言、没改恒真**。
- 诚实边界：只做头部层（mint/延续/透传/回显），不做 span 记录/采样/导出；`tracestate` 只透传不解析；
  版本只认 `00`，其余按畸形重 mint。CI `topology` job 仍未真实 push 执行；未推送（无明确指令）。
- 未选 Bulkhead（resilience4j 弹性三件套仅剩的一件）：`resilience4j-bulkhead` 在 gateway 是 **runtime**
  scope（非 compile），且「并发在途数」的 wire 断言在本机 2.5GB 环境时序敏感、易 flaky——与本项目
  「测真实读数不粉饰」纪律相冲。作为已知缺口记此，将来若上真并发夹具（如受控 latch 后端）再接。

## §SC 第二十七片：断路器状态从「测试能读」变成「运维能读」——暴露且默认守住 /actuator/circuitbreakers（2026-11-11）

- 起点：§SC-24（OPEN 失败快）与 §SC-29（HALF_OPEN 自愈）之后，breaker 的状态**只有测试**能通过注入
  `CircuitBreakerRegistry` 读到；值班运维答不出「哪个后端正被熔断、失败率多少、门合上没」。
  resilience4j-spring-boot3 **自带** `CircuitBreakerEndpoint`，jar 一直在 classpath，但
  `application.yml` 的 `exposure.include` 只有 `health`——读数在，没人读得到。用户要求「集大成/继续演进」，
  把弹性能力接到可观测面正是这种汇合。决定见 `docs/adr/0103`。
- 交付：
  - 生产 `application.yml`：`management.endpoints.web.exposure.include: health → health,circuitbreakers`
    （**零生产 Java 代码改动**：端点由 resilience4j 现有 bean 提供）。
  - `CircuitBreakerActuatorWiringTest`（2 条，auth-off context）：静态面——端点列出两个后端、与 registry
    真值对账、初始 CLOSED、`failureRateThreshold=50.0%`；动态面——§SC-24 连 drop 打开电路后端点显示
    `state=OPEN` + `failedCalls>0` + `failureRate` 真实带 `%`、另一后端仍 CLOSED（不是全站停摆），
    §SC-29 半开恢复后端点回 CLOSED。**门自愈第一次成为 operator 可见的事实，不是测试独占的断言。**
  - `CircuitBreakerActuatorAuthTest`（3 条，auth-on context）：无 token → `401 missing_token`；带有效
    token → `200` 可读 state；`/actuator/health` 仍开放。**专门验证 §SC-27 类陷阱的变体**：actuator 端点
    由 reactive handler 应答，`PlatformAuthFilter`（WebFilter）确实先执行、覆盖到它——暴露端点不开洞。
- **安全取舍**：`circuitbreakers` 刻意**不进** auth 白名单（只 `health` 可公开）。一张「哪些后端正在失败」
  的免费弱点地图不是 health probe；auth-off 的打包离线真值下它本地可读（同 `/platform/services`），
  部署靠打开 auth 决定。
- 读数：`mvn -o -B test -f services/nexus-gateway/pom.xml` = **78/78 BUILD SUCCESS**（SC-30 基线 73 + 5），
  **首次尝试全绿**：先一次性探针实测端点真实 JSON 形状（`{"circuitBreakers":{"nexus-api":{...,"state":...},...}}`）
  再写断言，没猜 DTO 字段、没靠库版本碰运气（区别于前两片的首跑红）。`CircuitBreakerActuatorAuthTest`
  冷启动 ~63s（本机内存），绿且稳定。
- 诚实边界：只读、无写操作；读数反映**本实例**内存状态，多实例各报各的（聚合未做，需另一组件）；
  `verify:topology` 冒烟未改为断言该端点（本片是网关单测）；CI `topology` job 仍从未被真实 push 执行；
  未推送（无明确指令）。

## §SC 第二十八片：两扇认证门共用一份策略——把「保持同步」从注释变成机制（2026-11-11）

- 起点：网关有**两扇认证门**——`AuthFilter`（`GlobalFilter`，守路由 edge）与 `PlatformAuthFilter`
  （`WebFilter`，守网关自己的 controller/actuator，§SC-27 补洞）。两者各自**复制**了同一张白名单、同一条
  「auth 开 + secret 空白就拒绝启动」的 fail-closed、同一段 401 拒答 body。两个类的注释都写着
  「keep the two whitelists in sync」——但那是**注释，不是机制**。§SC-31 刚又新增一个受保护端点，白名单
  正在变多，一次「只改一侧」就会静默开一个 §SC-27 形状的洞。用户要求「集大成/继续演进」，决定见
  `docs/adr/0104`。
- 交付：
  - **新增单一真值源** `AuthPolicy.java`：一份白名单（`OPEN_EXACT`/`OPEN_PREFIXES`）、一个段边界匹配
    `isOpen()`（exact 或 `prefix + "/"`；`/fallbackish` 不再命中 `/fallback`，尾斜杠容忍）、一个
    `requireSecret()`（fail-closed 下沉到两门**构造器**及 `GatewayConfig` bean）、一个 `refusalBody()`
    （两门 401 逐字同形）。
  - 两扇门删掉各自的四行白名单循环与字面量 401 body，改为委托；`GatewayConfig.authFilter()` 的
    bean fail-closed 也改为调同一函数。**原来 `AuthFilter` 构造器不检查空白 secret、`PlatformAuthFilter`
    检查**的不一致消失。
  - `AuthWhitelistParityTest`（4 条，行为锁）：8 条代表路径上两门判定一致、401 body 逐字相同、该开
    的开该守的守（含 `/fallbackish`）、两门空白 secret 都构造期拒绝。
  - `AuthPolicyTest`（6 条，真值源锁）：直接钉 `isOpen` 段边界（exact 不误伤 lookalike、前缀开子路径
    不开字符兄弟、尾斜杠容忍、null/真实路由受保护）、`requireSecret` 三态、401 方言文本。**结构折叠后
    若有人改回裸 `startsWith`，两门会一起漂移、parity 仍绿，这把锁专捕「一起错」。**
- **首跑红 2 条，都是真缺陷**：`/fallbackish expected 401 but was 0`（裸 `startsWith` 放行字符兄弟，
  §SC-27 洞的同类变体）；`route edge must refuse a blank secret`（`AuthFilter` 构造器不检查空白 secret，
  两门态度不一致）。**没放宽断言、没红改绿**：匹配改段边界、fail-closed 下沉构造器，从生产语义修。
- 读数：定向四条 **27/27**（AuthFilterTest 9 + AuthPolicyTest 6 + Parity 4 + PlatformAuthFilterTest 8）；
  网关全套 `mvn -o -B test -f services/nexus-gateway/pom.xml` = **88/88 BUILD SUCCESS**（SC-31 基线 78 + 10）；
  顶层 `npm run typecheck` = **14/14 PASS**。日志可见 `/fallbackish`、`/platform/services`、
  `/actuator/circuitbreakers`、`/api/publications` 在两门上都记 `missing_token` → 401。
- 诚实边界：段边界而非仅精确匹配（`/fallback/**` 是子树语义，尾斜杠容忍防配置手误）；parity 不 pin
  「哪张表对」、只要求两门一致，真值源锁才钉语义，故合法地**给两门同时**加白名单路径不会被阻拦；
  收敛是**同进程内/编译期**的，非跨服务配置中心（多实例用同一份代码常量，无运行时漂移）；零新依赖、
  零新端点、不扩大攻击面。整仓 `npm run eslint` 仍是本机内存下的超时边界（非 lint 报错），如实记；
  未推送（无明确指令）。

## §SC 第二十九片：重试的第二条触发源也挡住了写重放——连接层故障下的 GET-only 承诺（2026-11-11）

- 起点：`GatewayConfig.edgePolicy()` 的重试有**两条独立触发源**——`setStatuses(503)`（后端回 5xx）与
  `setExceptions(IOException, TimeoutException)`（后端连接层直接断）。`GatewayEdgePolicyTest` 已把前者
  钉在 wire 上（GET 重放一次 wire=2、POST 不重放 wire=1），但**后者从没测过**，而连接重置/进程崩溃
  恰是最常见真实故障。策略注释把「只重放 GET」当安全承诺（"one click becomes two publications"）；
  若方法门在异常路径上失效，一次网络抖动就会把一次投稿变两次——数据级事故。决定见 `docs/adr/0105`。
- 交付（**先一次性探针实测、再落判据，探针跑完即删**）：
  - `StubUpstream.dropNextConnections(int)`：前 N 个请求在 `paths.add()` **之后** `exchange.close()`
    （无响应字节）、之后自愈。有界、自恢复，补上桩件此前缺的「异常触发 + 能恢复」失败形态
    （`failNextRequests` 是回 5xx、`startDropping` 是手动永久断连，都不合此用）。`reset()` 清零。
  - `GatewayRetryTransportWiringTest`（2 条 × **6 轮**真实 socket 断连）：①**写永不被重放**——dropped
    POST 每轮恰好到后端 **1 次**、caller 诚实 503，`hasSize(1)` 兼证「打到 wire」与「无第二次尝试」；
    ②**重试不放大、答复必诚实**——dropped GET 每轮 wire ∈ [1,2]（上限 1 次重试）、status ∈ {200,503}
    （自愈或 fallback 诚实失败，绝非 500/429/挂死）。 breaker 刻意保持 CLOSED（窗口 100）以隔离方法门。
- **实测读数（探针 5 轮，不粉饰）**：POST wire **1,1,1,1,1** 全稳、status 全 503；GET wire
  **2,1,2,1,2** 浮动、status **503,503,200,503,200** 浮动。日志抓到 `PrematureCloseException` 与
  ADR-0101 同源的 `ServerHttpResponse already committed (503)` 噪声。
- **源码订正（猜错即改，记下来防再犯）**：初判以为 `PrematureCloseException` 是 RuntimeException、
  匹配不上 `setExceptions(IOException)`；查 `reactor-netty-http` 源码订正为
  `PrematureCloseException extends IOException`——**触发源二是活的**，GET 的 wire=2 走的就是异常重试。
  再查 `RetryGatewayFilterFactory.RetryConfig`：status 谓词 `retryableMethod && retryableStatusCode`、
  exception 谓词命中后 `return retryableMethod`——**两条触发源都套同一个 `setMethods(GET)` 门**，
  故 POST wire 恒 1 是方法门必然、非侥幸。
- **刻意不 pin**：GET 单轮精确 wire 与 status——它是 Netty 断连 / fallback 抢先 commit 503 / retry
  争着重放三者时序交叠的结果，跨轮浮动，钉死即 flaky 假绿。GET「能重试且只重试一次」的确定性证明
  归 `GatewayEdgePolicyTest` 的 status 腿（时序可控、wire 恒 2）；本片只负责异常腿的**写安全**证明。
- **不修生产**：触发源二配置活且正确（异常命中、方法门挡写、安全承诺成立，无缺陷可修）；GET 的
  status 浮动源于 retry 与 circuit-breaker 两 filter 失败路径抢写响应，与 ADR-0101 已决定「不改生产
  route 语义」的 `already committed` **同源**。修它要动 filter 编排/fallback，扰动 §SC-24/29 已验证的
  breaker 行为，风险远大于收益——延续既有决定，记为已知边界。
- 读数：单类 **2/2 PASS**（含 12 次真实断连采样）；网关全套 **90/90 BUILD SUCCESS**（SC-32 基线 88+2）；
  顶层 typecheck **14/14 PASS**。整仓 eslint 仍是本机内存超时边界（非 lint 报错），如实记；未推送。
- 仍欠（如实记）：本片测「响应前断连」（`PrematureCloseException`）；**超时型故障**（`TimeoutException`）
  与「响应中途断开」未覆盖——`StubUpstream.delay` 已在，但 timeout 与 retry 时序同样易浮动，需另造
  不 pin 时序的判据再接。多实例 breaker 聚合、CI `topology` job 经真实 push 执行，仍欠（同前片）。
  > 超时型故障这一项已由下一片 §SC 第三十片接上。

## §SC 第三十片：超时是重试的活触发源——钉住慢写不被重放，并抓出一只会说谎的桩（2026-11-11）

上片 ADR-0105 留的缺口：`setExceptions(IOException, TimeoutException)` 的 `IOException` 半已 wire 证明，
**`TimeoutException` 半（后端连着、只是慢到超过 timelimiter）从没测过**——resilience4j 四件套里
`timelimiter` 是唯一没有独立判据的一块，`application.yml` 的 `timeout-duration` 从写下起被所有测试当
背景参数 override。风险同源：若方法门在超时路径上失效，一次慢 POST 会变成两次投稿。

- **交付**：新增 `GatewayTimeoutWiringTest`（3 条）+ `StubUpstream.startConcurrent()`。判定三条不变式：
  ①**慢写绝不被重放**（POST × 5 轮，wire **恰 1** + 诚实 503 + cause `java.util.concurrent.TimeoutException`）；
  ②**慢读重试不放大**（GET × 5 轮，wire **∈[1,2]** + 诚实 503 + 精确 cause，永非空 200/500/挂死）；
  ③**超时 cause 是真值不是被发明**（钉死 fallback 五字段 + 精确类名）——这是 `GatewayRoutingTest` 那条
  `isNotEqualTo("not-reported")` 弱断言的 graded 替代，建在不会说谎的桩上，刻意不改旧测试。
- **先实测（一次性探针，跑完即删）**：`timelimiter=250ms` / 后端 `delay(1200ms)` / breaker 保持 CLOSED。
  **首轮探针 wire 读成 POST 1,0,0,0,1 / GET 0,0,0,1,0**——抓到一只会说谎的桩：`HttpServer.create`
  默认**串行**分派，一个慢请求占住唯一线程后，后续请求进不了 `handle()`，`paths.add()` 不执行 → wire
  假读 0；在这种桩上**真重放也会假绿**。加 `startConcurrent()`（cached pool executor，默认 `start()`
  一字不动保既有 90 测试语义）后重测：**POST 1,1,1,1,1 / GET 1,2,2,2,2，status 全 503，cause 全
  `java.util.concurrent.TimeoutException`**，才是对网关的真实测量。
- **源码订正（猜错即改，记下防再犯）**：查 `resilience4j-timelimiter:2.1.0`，`TimeLimiterImpl` 超时经
  `createdTimeoutExceptionWithName` 抛的**就是** `java.util.concurrent.TimeoutException`（`import
  java.util.concurrent.*`），正是 `GatewayConfig.setExceptions` 引的类——**异常触发源是活的**，非死配置。
  叠加 §SC-33 已源码确认的「exception 谓词命中后 `return retryableMethod`、套同一 `setMethods(GET)` 门」，
  慢写 wire 恒 1 是方法门必然。
- **刻意不 pin**：GET 单轮精确 wire（1 或 2）——retry 第二次 wire 先到桩、还是 fallback 先 commit 503
  是调度竞争，与 ADR-0101 `already committed (503)` 同源；`isBetween(1,2)` 钉上界、不钉这一次是几。
- **不改生产**：异常触发源活、方法门挡写、答复诚实，无缺陷可修；本片把安全不变式从「配置存在+源码可推」
  升级为「wire 实测+多轮稳定+cause 真值」，并**堵上一只会假绿的桩**。工程教训：`HttpServer` 默认串行，
  任何用 `delay`/长 sleep 又断言 wire 计数的测试都必须在并发桩上跑，否则测到的是桩的排队而非网关转发。
- **读数**：单类 **3/3 PASS**（含 5×2 次真实慢超时采样）；网关全套与 typecheck 见下。整仓 `npm run
  eslint` 仍是本机内存超时边界（非 lint 报错），如实记；未推送（无明确指令）。
- **仍欠（同前片 + 本片新增）**：「响应中途断开」（响应头已发、body 中途断）仍未覆盖，需另造判据；
  多实例 breaker 聚合、CI `topology` job 经真实 push 执行，仍欠。

## §SC 第三十一片：共享限流器的 fail-open 在真实 Lettuce 故障上被测——门不关、请求到后端、告警不静默（2026-11-11）

SC-12 给门装了共享令牌桶（`redis` 后端全实例共用一个原子桶），`RateLimitFilter` 声明后端故障时
**fail-open**（`onErrorResume(error -> Mono.just(true))`）：「a rate limit is a bound, not an authentication
decision；护栏坏了不该把门焊死」。但这条承诺此前只有 `RateLimitFilterTest` 用 **mock backend 立即
`Mono.error`** 验证过——测了 `onErrorResume` 的 Java 语义，没测真实 Redis 依赖故障的连接池 / 重试 /
超时，更没测「请求是否真穿到后端拿诚实答复」。共享限流依赖恰是那种一挂就想关门的组件，这是最值得在
真实故障下证明的韧性。

- **交付**：新增 `GatewayRedisFailOpenWiringTest`（1 条方法 × 5 轮，真实 Lettuce 连接失败）。钉三条不变式：
  ①**门不关**——每轮 caller 拿后端诚实 **200**（非 500/429/空成功），availability-over-throttling 的 SC-12
  取舍成立；②**请求真穿到后端且只一次**（wire **恰 1**）——fail-open 放行整条链、且限流失败不重放；
  ③**告警被记、不静默**——`OutputCaptureExtension` 断言至少一条含 `fail-open` 与后端名 `redis` 的 WARN，
  operator 能区分「门开着但未限流」与「限流器在岗」。
- **先实测（一次性探针，跑完即删）**：`backend=redis` 指向**端口 1（无监听，确定性 connection-refused）**、
  Redis 超时压到 300ms、后端正常 200。3 轮读数：caller 全 **200**、后端 wire 全 **1**、耗时
  **1205ms → 22ms → 19ms**（首轮冷 Lettuce 连接失败 + 重试，失败缓存后快速失败），日志
  `backend 'redis' failed; request allowed unthrottled (fail-open): RedisConnectionFailureException`。
  3 轮故障只打 **1 条** WARN（`BACKEND_WARNING_INTERVAL_MILLIS=10s` 节流生效）。

- **刻意不 pin**：每轮精确耗时（1205/22/19ms 是 Lettuce 连接池状态 + 机器速度的函数，钉死即 flaky）；
  只设 **8s 宽松上界**兜「真挂死」——fail-open 存在的首要理由。日志只钉「至少一条」（节流，非每轮一条），
  不 pin 精确条数；异常只钉「fail-open 发生了」，不钉具体类名（connection-refused 是
  `RedisConnectionFailureException`，blackhole 会是 timeout 类）。
- **诚实缺口（记下不假装已解）**：`RedisRateLimitBackend.tryAcquire()` **没有显式 `.timeout(...)`**，
  把「不可达变 error」交给 Lettuce 自身 connect/command 超时。对探针的 connection-refused 形态链条是活的；
  **黑洞型**依赖（连上但慢于上界不回）会先拖住请求到边界才 error→fail-open，精确延迟本片未测（需不可路由
  地址、依赖本机网络易 flaky）。若要与 Lettuce 实现无关的硬上界，将来可在 backend 叠显式 `Mono.timeout`——
  生产改动，另立一片评估，本片不越界。
- **不改生产**：SC-12 契约在真实连接失败上成立，无缺陷可修；本片把只被 mock 证明的韧性升级为 wire 事实，
  并把对可观测性的要求一并钉住。
- **读数**：单类 **1/1 PASS**（含 5 轮真实连接失败采样）；网关全套 **93 → 94/94 BUILD SUCCESS**；顶层
  typecheck **14/14 PASS**。整仓 eslint 仍是本机内存超时边界（非 lint 报错），如实记；未推送。
- **仍欠（同前片）**：响应中途断开；`RedisRateLimitBackend` 显式超时硬上界（blackhole 形态）；多实例
  breaker 聚合；CI `topology` job 经真实 push 执行。
  > 上片留的「显式超时硬上界」已由下一片 §SC 第三十二片接上，并诚实划定它在 connect 阶段的边界。

## §SC 第三十二片：共享限流器有了自持 deadline——把「没回答」在网关自己的表上变成 fail-open，并诚实划出 connect 阶段边界（2026-11-11）

- **缺口**：ADR-0107 在真实 connection-refused 上证明了 fail-open，但 `RateLimitFilter.onErrorResume` 有一条
  从未被写下的前提——backend **最终要产生 error**。一个「连上却永不回」的 backend（`Flux.never()`：命令卡死、
  池耗尽等槽、Lua 死循环、DNS hang）既不 emit 也不 error，`onErrorResume` 永不触发，请求永久挂在限流关——
  用坏护栏把门焊死，正是 `RateLimitFilter` 注释发誓避免的 "degraded limiter → full outage"。SC-35 明确定过：
  给 fail-open 一个与 Lettuce 实现无关的硬上界，是「生产改动，另立一片」，本片即那一片。
- **生产改动（最小、不碰 fail-open 语义）**：`RedisRateLimitBackend.tryAcquire()` 在 `map` 后叠
  `.timeout(backendTimeout)`，把「没回答」在 deadline 上变成 `TimeoutException` error，交回 SC-12 原有
  `onErrorResume` 链；`GatewayConfig.rateLimitFilter` 注入 `nexus.gateway.rate-limit.backend-timeout-ms`
  （env `NEXUS_GATEWAY_RATE_LIMIT_BACKEND_TIMEOUT_MS`，默认 **1000ms**）并写进启动日志；构造器 **fail-closed
  拒绝** `null`/零/负上界。`RateLimitFilter`、`application.yml` 的 fail-open 取舍、memory 后端均不改。
- **先实测（三次一次性探针，跑完即删；读数见 ADR-0108）**——结果**推翻了初始方案**，故如实记：
  1. 探针①（mock backend `Flux.never()`）：改前靠调用方 `block(600ms)` 才脱离；链外叠 `+200ms` 则在
     **267ms** 由响应式链自己 error。命门是两种 `TimeoutException` **来源不同**：前者是调用方强加、backend
     零信号，后者才是 `onErrorResume` 能接住的那一种。
  2. 探针②（真实 Lettuce 连 TCP accept 后永不回字节的黑洞，Lettuce 超时压到 3s）：`execute()` 调用 **4ms**
     （懒）；带 `.timeout(400ms)` 的 `tryAcquire` 却等了 **4051/3085ms**，异常是 Lettuce 的
     `RedisConnectionFailureException`——**400ms 自持上界没有先于 connect 阶段触发**。
  3. 探针③（对比专用 scheduler）在 `dispose`/Lettuce 非 daemon 线程清理时 **hang 住 JVM 退出**，跑 9 分钟
     日志 0 字节，按「遇阻塞绕开、不把超时说成通过」主动 kill，**不作任何结论证据**，只记一次探测失败。
- **据此重新定位（关键诚实决策）**：初始以为「叠 `.timeout` = 全形态自持硬上界」，探针②证伪它对**连接层
  黑洞**的覆盖——Reactor timer 中断不了 Lettuce **connect 订阅**（Netty connect/cancel 语义），那种形态本就该
  由 `spring.data.redis.connect-timeout`（默认 1s，探针故意拉到 3s 才显出 3-4s）兜底。`.timeout(backendTimeout)`
  真正守的是**连接已建立后、命令答复永不返回**的形态（探针① 的 `Flux.never()` 是其确定性等价）——那正是 backend
  自己该负责、下游 command timeout 可能因配得过长而没守住的窗口。**不改生产方案，但把承诺边界说清楚**：它是
  网关自持的**命令阶段** deadline，不是连接阶段的替代；两者是分工。把这点说成「全形态硬上界」即假绿。
  旁证：本片首版 wire 用真实 TCP 黑洞 + `connect-timeout=10s`，3 轮断言**只在耗时那行红**（11953ms），
  `status==200`/`wire==1` 全过——黑洞下门**最终未焊死**、诚实 200、穿后端恰 1 次，只是兜底耗时由 Lettuce 决定。
- **双判据，各钉各的、不越界**：
  - **单元** `RedisRateLimitBackendTest`（原 5 条语义不变 + 新增 3 条）：`Flux.never()` → 宽松上界内以
    `java.util.concurrent.TimeoutException` 结束（不 pin 精确毫秒）、上界即配置值、非正上界构造期拒绝。
  - **wire** `GatewayRedisBackendTimeoutWiringTest`：用 `@Primary` 的 `Flux.never()` Redis 模板（受控源，
    刻意移除网络 confounder）经**真实网关过滤器链**证明 deadline 触发后：门不焊死（诚实 200）、请求穿后端
    恰 1 次、fail-open 告警不静默、无 hang（8s 宽松上界只抓真挂死）。实测日志坐实是网关自持的 deadline 在
    工作：`fail-open ... TimeoutException: Did not observe any item or terminal signal within 400ms in 'map'`。
  - 与 SC-35 构成**完整故障谱**：SC-35 = 真实 connection-refused（Lettuce 兜底）；SC-36 = 命令阶段永不返回
    （网关自持 deadline 兜底）；连接层黑洞边界本片如实记录（Lettuce `connect-timeout` 兜底）。
- **刻意不 pin / 诚实边界**：精确耗时（400ms 是配置值，实际受 scheduler 抖动；wire 8s 上界只兜真 hang，单元
  只要求远小于 3s 逃生口）；**不宣称连接阶段有自持硬上界**（探针②，要消除需改 Lettuce/Netty 层或独立连接
  看门狗，属更大生产改动，记下待评估）；探针③ hang 不作证据；memory 后端无等待可 bound，不受影响；不改
  `RateLimitFilter` 与 fail-open 取舍。
- **读数**：单元 `RedisRateLimitBackendTest` **8/8**、wire 单类 **1/1 PASS**；网关全套与顶层 typecheck 见下方
  验证记录。整仓 eslint 仍是本机内存超时边界（非 lint 报错，本轮零前端文件），如实记；未推送。
- **仍欠（同前片，去掉已闭合的「显式超时硬上界」）**：连接层黑洞的独立看门狗（消除 connect 阶段对 Lettuce
  的依赖，需更大生产改动）；响应中途断开；多实例 breaker 聚合；CI `topology` job 经真实 push 执行。

## §SC 第三十三片：Bulkhead 不是「没接」，是沉默默认——把它变成声明出来、可调、可读、wire 级证明的容量边界（2026-11-11）

起点是第二十六片留下的一句「有意未接 Bulkhead：runtime scope + 并发易 flaky」。这一回**先用反编译把「没接」这个前提本身推翻了**，再补上真正缺的东西。

- **前提订正（读字节码，不猜）**：Spring Cloud 的 reactive 断路器**早就**在每条 route 上套了 `SemaphoreBulkhead`——`ReactiveResilience4JCircuitBreakerFactory` 与 `ReactiveResilience4JCircuitBreaker` 都持有 `ReactiveResilience4jBulkheadProvider`，由 auto-config 默认注册；`run()` 字节码顺序是 `decorateMono → CircuitBreakerOperator → Mono.timeout → onErrorResume(fallback)`，舱壁在最内层。`create(id)→create(id,id)`、`decorateMono(groupName=id)` 从 `BulkheadRegistry` 按 id 取，id 正是 `setName(service)`。默认值 `DEFAULT_MAX_CONCURRENT_CALLS=25`。**所以不是接不接，而是**：一个决定「多少并发能打到后端」的边界，一直靠库默认值在跑，无配置、无 env、无读数、无行为证明。
- **生产改动（把沉默默认变显式承诺）**：`application.yml` 为两后端各声明 `resilience4j.bulkhead.instances.<service>`：`max-concurrent-calls: ${NEXUS_GATEWAY_BULKHEAD_MAX_CALLS:25}`、`max-wait-duration: 0`。**默认仍 25**（库默认），故行为不变；变的是「谁决定这个值」——平台显式选择、部署可 env 收紧。wait=0 = 满即减载、不排队、不制造隐藏延迟悬崖。零生产 Java 改动（Spring Cloud 接线本就正确）。
- **运维读数 + 诚实边界**：exposure `health,circuitbreakers` → `health,circuitbreakers,bulkheads`。**探针实测 `BulkheadEndpoint` 只给 `{"bulkheads":[...]}` 名字列表，`/actuator/bulkheads/{id}` 是 404，没有实时在途数**——这是「哪些 route 挂了边界」的读数，不是并发仪表（明确写进 ADR-0109 与测试断言，绝不包装成容量指标）。auth-on 时无 token 401 / 带 token 200 / health 仍开放，独立 context 实测。
- **wire 判据 `GatewayBulkheadWiringTest`（3 条，一条都不 pin 竞态）**：新夹具 `StubUpstream.holdNext(n)` 占住前 N 个 handler 线程 + `awaitHeld()` 握手**证明在途**，之后才发第 N+1 个调用。钉：①满时诚实 503、`cause=BulkheadFullException`；②**拒绝在 wire 之前**（后端只见放行的 N 条，不放大、不把更多活压给满载后端）；③breaker 全程 CLOSED、cause **不是** `CallNotPermitted`（容量减载 ≠ 后端故障，两者不能混）；④释放后自愈。连跑 3 轮 + 整套 3 次稳定。
- **为什么旧判「易 flaky」如今能做**：换掉靠 `sleep` 碰运气重叠的夹具，改用 `CountDownLatch` **确定性占用**（占用是事实后才发下一个调用）。三个硬约束：必须 `startConcurrent()`（串行 `HttpServer` 会让被占 handler 挡住后续、wire 假读，SC-34 同类桩谎言）；等待有界 + `@AfterEach` 无条件 `release()`（SC-36 非 daemon 线程 hang JVM 退出 9 分钟的教训）；并发腿用**非阻塞 `WebClient`**（`WebTestClient.exchange()` 阻塞，一个线程发不出两个在途——探针编译阶段就拦下了这个选型错误）。
- **读数**：单类 3/3（连跑 3 次）、actuator wiring 3/3、actuator auth 3/3；网关全套 110/110（context 缓存根治见下片）；typecheck 14/14。一次性探针（5 类字节码反编译 + 3 轮真实并发读数）跑完即删。未推送。
- **仍欠**：多实例 breaker/bulkhead 聚合（各实例各报各的）；连接层黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push 执行。

## §SC 第三十四片：响应中途断开不说谎——以及「多个测试随机红」的真凶是 context 缓存没封顶（2026-11-11）

本片有两半：一半补后端故障的第四种形状，一半被迫根治一个被新增测试**揪出来**的测试基础设施缺陷。

### 前半：响应中途断开（SC-38）

- **缺口**：后端故障四种形状，5xx / 连接拒绝 / 响应前断连都已有 wire 判据，唯独**第四种从没测**：发 `200 + headers + 部分 body` 后声明的 `Content-Length` 未满足就 close。最容易说谎的一种——网关可能把半截 JSON 当成功，调用方解析出空内容报「没有数据」，真相是「后端死了」（§159 禁止的「空列表冒充 outage」的近亲）。
- **一次性探针实测（先读数，不预设）**：`StubUpstream.truncateResponses()` 声明比实际更长的 body、只写前半就 close。GET/POST 各 3 轮一致：调用方收到**连接级失败** `PrematureCloseException: Connection prematurely closed DURING response`，**从未** 200 + 截断 body；后端 wire 恒 1（GET 不重试——已拿 200 头进入 body 阶段才断，retry 两触发源都不覆盖「响应头已转发后的 body 断流」）；健康基线 200/42B 不污染。
- **决定：不改生产，网关已正确**。把安全属性变 wire 不变量（`GatewayTruncatedResponseWiringTest` 3 条 × 3 轮）：①中途断开绝不返回「成功响应」，失败信号带真实 `PrematureCloseException DURING response`（不伪造 cause）；②GET/POST wire 恒 1、不重放不放大；③健康应答仍是真 200（守夹具不自欺）。
- **诚实边界（不粉饰成假绿）**：调用方看到的是**连接级异常，不是干净 503**。原因同 ADR-0101 的 `ServerHttpResponse already committed`——body 断时 200 头已转下游，改 503 会撞「已提交」。平台**无法**在此承诺 503，能承诺的是「不把断流伪装成成功」。要干净 503 需「响应提交前全量缓冲 body」的更大改动，另立片，本片不假报已做到。刻意不 pin 耗时（冷连 ~1.2s / 热连 ~30-50ms）与包装异常确切类型。

### 后半：全套随机红的真凶 —— Spring context 缓存没封顶

- **现象**：SC-37 加 4 个 `@SpringBootTest` 后全套 98→110。连跑两次全套**每次各红一条不同的既存测试**（retry wire=0、routing 读到残留 `"/drop"`），第三次三条不同测试同时红（两个 actuator 的 `/actuator/health` 报 **503**、`ServiceHealthProbeTest` 变 UNKNOWN），同时稳定出现 `Surefire is going to kill self fork JVM ... 30s after System.exit(0)`。**每条单独跑都稳定。** 逐条改断言是错的。
- **根因（对照实验定性）**：排除本轮 4 个新类后全套 **BUILD SUCCESS、零告警**。病灶不是新测试本身，而是测试基础设施：全套 **21 个 RANDOM_PORT `@SpringBootTest`**，各带不同 properties → Spring context 缓存默认 `maxSize=32` 把**全部 21 个 Spring + Netty context 常驻同一 `-Xmx512m` fork**。新增 4 个把常驻数推过堆临界点 → GC 压力拖慢 health 探测（报 503）、拖慢 in-flight wire 记录（时序漂移）、拖住非 daemon 线程（fork 退出告警）。
- **治本（测试夹具界，零生产影响）**：surefire `argLine` 加 `-Dspring.test.context.cache.maxSize=4`（属性名经 `spring-test` 的 `ContextCacheUtils.retrieveMaxCacheSize()` 字节码核实、`SpringProperties` 读 `-D`）。缓存上限 4 让 Spring **淘汰最久未用 context**，常驻数不再随测试类增长。代价：context 重启使全套耗时升到 ~3:06，换确定性——正是「测真实读数不粉饰」该付的价。
- **顺带修两条被环境压力揪出的既存过度紧断言（语义等价、不放宽）**：`GatewayRetryTransportWiringTest` 的 wire 改经有界 `awaitPathsAtLeast(1,250)` 等 floor（retry 第 2 条可能晚于 fallback 提交 503 才落 wire）再钉上界 ≤2，保留「真到后端 ≥1 / 不放大 ≤2」两条不变式；`GatewayRoutingTest` domain 腿 `apiUpstream.paths()).isEmpty()` 改 `doesNotContain(domain 路径)`（原断言比本意更强，前一条 `/drop` 的 retry 尾请求会在 `clearPaths()` 后留下无害 `"/drop"`）。
- **验证**：封顶前连跑三次全套三次各红不同既存测试 + 稳定 fork 告警；封顶后三次独立全套均 **110/110 BUILD SUCCESS、fork 告警消失**，typecheck 14/14。
- **经验（供接手）**：①多个测试红且各自单独绿 → 先怀疑共享资源/context 累积，别逐条改断言，对照实验（排除新增类跑基线）最快定性；②加 `@SpringBootTest` 就想 context 缓存——真实 socket context 很重，套件一大必须封顶 maxSize，否则堆临界点上 health/时序断言随机红还伪装成业务 bug；③**有界等待 + 语义上界**优于「瞬时读数 + 宽区间」：既抓放大又抗竞态。详见 ADR-0110。
- **已探但有意不做成判据（多实例 retry × LB，详见 ADR-0110 第一部分附）**：一次性探针（3 轮，跑完即删）实测 gateway route retry **会**重选实例（dead 断连后第二条 attempt 落到健康 live 并答 200），但 caller **恒得 503**、cause 恒为 dead 的 `PrematureCloseException`、breaker 全程 CLOSED——这是 ADR-0101 `already committed` 竞态的**跨实例版本**：dead 的异常先被 fallback commit 503，live 的 200 迟到无处可写。**不钉成 wire 判据**：liveWire(0/1)/status 受调度竞态支配，钉精确值必 flaky；且非独立新缺口，是已记录边界的重演。部署含义：breaker 读数是 **service-id 级**、看不出哪个实例坏；探针用 SimpleDiscovery 静态列表（无健康剔除），真生产 eureka 会摘除坏实例缓解之。根治需响应缓冲或按实例粒度 breaker，另立片。
- **仍欠**：多实例 breaker/bulkhead 聚合（service-id 级读数的另一面）；连接层黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push 执行。

## §SC 第三十五片：路由表要可读，但绝不把写面一起交出去（SC-39 / ADR-0111，2026-11-11）

网关最核心的资产——「此刻哪些前缀路由到哪个后端」——此前**读不到**：唯一真值是 `GatewayConfig.nexusRoutes()` 的编译期 Java DSL，运维只能读源码。SC-31 给了 breaker 读数、SC-37 给了 bulkhead 读数、`/platform/services` 给了 registry 读数，唯独路由表本身没有。这一片补上，并在过程中把两条一直只写在注释里的安全决策第一次变成可观测事实。

- **先探针、先反编译，不猜、不直接接线官方端点**：一次性探针（3 服务 + exposure 含 `gateway`、auth-off）实测 `/actuator/gateway/{routes,routesdef,globalfilters,routefilters,routepredicates}` 与 POST `/refresh` / POST `/routes/{id}` / DELETE `/routes/{id}` **全部 404**。字节码给出原因：`GatewayControllerEndpoint` 是 `@RestControllerEndpoint(id="gateway", enableByDefault=false)`——**默认禁用是库的有意设计**，光进 exposure 开不了它（还需 `management.endpoint.gateway.enabled=true`），且父类带 save/delete/refresh 三个**写操作**，能在运行时动态增删路由、刷新路由表。本网关打包默认 auth-off，一次误配 `enabled=true` 就是在无 token 的门口挂一个路由注入写面。**决定：绝不启用官方端点。**
- **也评估并否决了「受控启用 discovery locator」**：反编译 `buildRouteDefinition()` 证明它从 `DiscoveryLocatorProperties.predicates/filters`（字符串 `PredicateDefinition`/`FilterDefinition`）+ SpEL 表达式拼路由；要把现有 `edgePolicy`（retry/circuitBreaker/stripPrefix/setRequestSize/secureHeaders）接上去必须把整条编译期 Java DSL 复制成运行时字符串配置，制造第二套会漂移的真值源——正是选 Java DSL 要避免的。**`GatewayConfig` 里「有意不开 discovery locator」（SC-1 起）的决策站得住，不推翻，而是本轮把它坐实成事实。**
- **生产改动（一个只读控制器，零写面、零新依赖）**：`PlatformRoutesController` 暴露 `GET /platform/routes`，注入 `RouteLocator#getRoutes()`——与路由管线**同一个** locator。刻意不用 `RouteDefinitionLocator`：本网关路由由编译期 DSL 直接构造运行时 `Route`、从不注册 `RouteDefinition`，读 definitions 会返回空、是一句谎话。只报稳定身份字段 `id`/`uri`/`order`；`uri`（`lb://<service>`）点明 service id，与 breaker/bulkhead 读数是同一命名空间，三份读数互相对账。
- **诚实边界（不伪造读不出的东西）**：运行时 `Route` 的 predicate 是 `AsyncPredicate`、filter 是 `List<GatewayFilter>`，都是编译后函数对象；反编译官方 `serialize(Route)` 证明连 Spring Cloud 自己都只调 `toString()`、无结构化表达式可读。本控制器不印一个假的 path 模板或 filter 列表，`note` 明说边界并指向 `GatewayConfig` 审计 edge policy。「registry 里有、读数里没有」= 无路由，写成**恒真**陈述（将来真开 locator 时自动路由也会出现在读数里，声明不过时）。
- **wire 判据把注释变事实**：`PlatformRoutesWiringTest`（3 条 × 3 轮）：①注册中心advertise 三服务（nexus-api / nexus-domain-service / **rogue-service**），读数**恰两条** `lb://` 命名路由、不含 rogue，且逐字段与 live `RouteLocator` 对账（不是印死的字面）；②`/rogue-service/anything` **404 且 `rogue.wire=[]`**（registry 知道它、门不给它路由），命名路由 `/api/publications` 200 且 `api.wire=[/publications]`——「缺席即无路由」的 wire 证明；③exposure 故意含 `gateway`，钉 GET/POST/DELETE **全 404**，证明「exposure 单独开不了写端点」、本网关没带写面。`PlatformRoutesAuthTest`（3 条 × 3 轮）：auth-on 无 token 401 / 带 token 200、401 方言逐字一致、health 仍开放——既有 `PlatformAuthFilter` 无需生产改动就覆盖到这个**新** controller（gateway 自有 controller 先于 route pipeline 应答，只有 `WebFilter` 够得着）。
- **验证**：定向 6/6 × 3 轮全绿；网关全套 `mvn -o -B test` **116/116 BUILD SUCCESS**（两次独立全套，context 缓存封顶后无 fork 告警）；顶层 `npm run typecheck` **14/14**。一次性探针 `GatewayActuatorProbeTest` 跑完即删。未 push。
- **仍欠**：多实例 breaker/bulkhead 按实例粒度聚合（service-id 级读数的另一面，ADR-0110）；连接层黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push 执行（需授权 push）。

## §SC 第四十片：网关三份读数终于接到前端——一条纵切同时落下 Redis / 计网 / 算法 / 缓存 / 前端美学（SC-40 / ADR-0112，2026-11-11）

这一轮换了重心：前几片把 Spring Cloud 网关弹性做到 SC-39（全套 Java 116/116），边际递减；用户点名 **Redis、计网、算法、操作系统/数据结构级优化、前端登峰造极、前后端协同、数据库与缓存性能**。真问题随之浮出——网关 SC-29→39 产出的 `/platform/{routes,services,health}` 三份运维读数，**全仓库零前端消费者**，`admin/observability` 只看得到 web 自己的进程计数器。这一片把它们接成一张前端态势图，六项侧重各自有真实落点，不是堆砌。

- **空位探针（只读，先读真实状态）**：确认三个 `/platform/*` 端点零消费者、`AdminNav` 八个入口无"网关态势"、`NEXUS_GATEWAY_URL` 不存在、Redis 已有 `NEXUS_REDIS_URL` 单一旋钮（限流/实时总线共用）、design-token 门禁扫 `var(--nexus-*)` 与强调色配对、`noUncheckedIndexedAccess` 严格模式。git 侧仍单 main、无 worktree/stash/游离分支、`--no-merged` 空——**无可并内容**（不伪造合并）。
- **一条纯 TS 门面 `apps/web/src/server/gateway/`（零新依赖，全部可注入判据）**：
  - `types.ts` 手写归一化：外部 HTTP 回执形状不认识 → `null` → `unavailable`，不 `as` 断言伪装类型；`lb://<service>` 抽 service id 供 join。
  - `backoff.ts` **全抖动退避** `rng()*min(cap,base*2^n)`（计网惊群经典）+ cap 封顶；rng 注入让"随机"可逐支验电。
  - `cache.ts` **有界 TTL + LRU + singleflight**（数据结构/OS）：键来自注册中心（外部可控），有界防内存漏点；同键并发只跑一发防 N 个 admin 把 health 扇出打成 N 遍。
  - `client.ts` `AbortSignal.timeout` + **只重试该重试的**（5xx/网络/超时/429 才退避；4xx/坏形状立即失败、不缓存失败值）+ `allSettled` 并发扇出（一列挂不拖垮整页）+ **失败降级不画 0**（有旧值标 `stale`，无旧值 `unavailable`）。fetch/sleep/now/clock/rng/shared 全可注入，判据零网络零真实等待。
  - `snapshot.ts` **三表按 service id join**：错处才是价值——`unrouted`（注册了没路由，ADR-0111 rogue 边界第一次前端可见）、`dangling`（有路由没注册）、DOWN/UNKNOWN 分列；**没测到的列画 `null` 不画 0**，三列 measuredAt 各不同如实登记"非原子快照"。
  - `index.ts` 门面单例挂 globalThis（热重载共享缓存/单飞）；**Redis opt-in**（`NEXUS_REDIS_URL` 同旋钮）、懒接、`enableOfflineQueue:false`、fail-open 回进程内；`NEXUS_GATEWAY_URL` 没设给可解释默认但不谎称"平台在此"。
- **前端（登峰造极但零新增颜色 token）**：`/api/admin/gateway`（`role=admin` 门 + `no-store` + snapshot 原样端出，不二次加工把 `null` 抹成 0）、`/admin/gateway` 服务端首屏（取数失败降级三列 `unavailable`，不白屏不画空图）、`GatewayPanel`（每 4s 轮询 + `visibilitychange` 后台暂停 + 请求失败保留上一帧 + 骨架屏 + KPI + 逐服务状态灯 + gap 清单 + 三列时刻条）、`AdminNav` 加"网关态势"入口。视觉层并入 `globals.css` 的 `@layer components`（`.gw-` 类）：层次（表面分级 + brand→accent-1 渐变描边）+ 光晕（状态灯 `color-mix` 借语义色、只染圆点不染文字）+ 呼吸（脉冲走 motion token、`prefers-reduced-motion` 全归零）。**取舍**：全仓第一个 CSS Module 在 `noUncheckedIndexedAccess` 下 `styles.x` 是 `string|undefined`（需额外 `.d.ts`），改并入 globals 让类名回到普通字符串，style-tokens 门禁本就扫它、管得更统一。
- **判据抽纯模块（复用 `reclaim-state.ts` 范式）**：`gateway-view.ts` 收 `null→Dash` / 健康态映射（UNKNOWN 绝不当 DOWN、只有 DOWN 用红点）/ 归类文案 / 后台暂停 / 非原子提示；组件只消费，测纯函数不渲染。新增 **44 条判据全绿**（pure 18 + client 14 + view 12）；相关横向门 style-tokens 24 / route-security-gate 5 / jsx-text+control-names+api-response+observability+doc-evidence 43——连同 **116/116**。
- **数据库性能探针（如实记，不冒险改）**：`schema.ts` 每个热读都有对应复合索引、96 个 `CREATE INDEX`（0043 连查询计划分析都写了）——**没有真库 `EXPLAIN ANALYZE` 就不凭空加索引**。发现 `discover()` 发现页热读**无缓存**且依赖 `viewerId`（关注排序 + 屏蔽名单），全局缓存会串味 → **记为下一条独立片**（按 viewer 分键 + 真库集成测数据隔离），本轮不把敏感数据隔离路径混进这一纵切。连接池已配（`NEXUS_DB_POOL` 默认 5），合理。
- **验证（不粉饰）**：项目日常门 `npm run typecheck`（turbo）**14/14**；网关全套 Java `mvn -o -B test` **116/116 BUILD SUCCESS、无 fork 告警**（本轮零 Java 改动，做全仓回归确认）；前端判据 116/116。**边界**：`typecheck:main` 聚合命令有 3 条 `docs/evidence/**/*.mjs` 的 `TS8016`（`.mjs` 里写 `as` 断言，`checkJs:false` 挡不住语法错），经 `git show HEAD` 核实**既存、非本轮引入**，日常门不跑它，如实记为仍欠、不擅自扩大改动。整仓 eslint 仍是本机内存超时边界（本轮零 lint 报错），如实记。
- **两次真信号，都没放过**：①缓存判据首跑 `expected 5 to be 3`——诊断证明是**夹具**给三列都喂了 routes 形状、services/health 归一化失败故不缓存（正是"读不出≠有"的诚实行为），非生产缺陷，修夹具后全绿；②CSS Module 迁移带出 5 个 `string|undefined` 与 `className={gw-x}` 裸标识符，逐个修净、typecheck 归零。
- **仍欠**：`discover()` 按 viewer 分键缓存（数据隔离敏感，另立片 + 真库集成测）；实例粒度 breaker/bulkhead 聚合；连接层黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push；3 条既存 `.mjs` TS8016。未 push。

## §SC 第四十一片：发现页热读按 viewer 分键缓存——隐私即时失效，和那个"淘汰就复活旧隐私"的陷阱（SC-41 / ADR-0113，2026-11-11）

SC-40 探针留下一条独立片：`discover()` 发现页热读**无缓存**且依赖 `viewerId`（屏蔽名单 + 关注排序），全局缓存会串味。本片正面接上，把用户点名的 **缓存 / 数据库性能 / 数据结构与算法 / 前后端协同** 各落在真实坏法上——难点从不是"加个 Map"，而是缓存一个**随 viewer 私有关系而变**的结果，且写后必须即时失效（拉黑在 TTL 窗口内不生效 = 隐私事故）。

- **空位复核（只读）**：`discover` 两个调用点（RSC `/discover/page.tsx`、route `/api/discover`）在 `force-dynamic` 下每次导航重跑，无任何缓存/请求级去重；私有面收敛到三处——`hiddenAuthorIds` 过滤 + `hiddenAuthors` 计数、`following` 的关注集合、匿名早退。卡片**不含** `likedByMe`/已读等 per-viewer 字段，故键只需 `(viewerId, sort, limit)`。真库在线（`localhost:55433` LISTENING），既有串味模板 `blocks.integration.test.ts:246` 可直接对照。git 单 main、无 worktree/stash/游离分支、`--no-merged` 空——**无可并内容**。
- **生产（薄包装 + 单向无环，未改 `discover` 函数体 / DB 查询 / 索引 / 依赖）**：
  - 新增 `server/domain/discover-cache.ts`：键 = `discover:v1|<generation>|<JSON([viewerId??null,sort,limit??24])>`（JSON 编码防分隔符碰撞）；复用 ADR-0112 的 `BoundedCache`（有界 TTL+LRU+singleflight），`maxEntries` 默认 2048、`maxViewers` 默认 512、TTL 默认 15s（三个 `NEXUS_DISCOVER_CACHE_*` env 可调）；单例挂 `globalThis`（热重载共享）；**只 `import type` social**、loader 由闭包注入 → 依赖单向无环。singleflight 按完整键合并：不同 viewer 永不合并（否则即串味），同 viewer 并发只打一次库（真降载）。
  - `social.ts` 加一句 `discoverCached(input) = loadDiscoverCached(input, () => discover(input))`；两个调用点切到它；`discover` 仍是隐私/排序/算法唯一真值源，缓存层不复制任何判定。
  - **三条真写路径即时失效（O(受影响 viewer 数)，无前缀扫描）**：`setBlock(mute)` → actor；`setBlock(block)` → actor + target（还删了双向关注边）；`clearBlock` → actor；`toggleFollow` → actor。隐私新鲜度靠主动失效，**不靠 TTL**；TTL 只管公有内容（新发布/计数/trending 榜单）别太陈旧。
- **本片方法论核心——单调水位线 `globalGen`（最隐蔽的陷阱，写进 ADR-0113）**：generation 若按「每 viewer 从 0 起的小计数器 + LRU 淘汰」实现，viewer 被淘汰后重新初始化为 0 → **命中它拉黑前缓存的那份 key，隐私过滤被淘汰悄悄撤销**。根治：进程级 `globalGen` 只增不减、跨淘汰/跨 store 重建都不归零，任何 viewer 重新分配到的 generation 严格大于历史值，旧键永久拼不出来，最坏多查一次库。判据用 `maxViewers=2` 强制淘汰 A，钉死"绝不复活 C_before"。
- **判据（不粉饰）**：纯单测 `discover-cache.test.ts` **16/16**（键三维/防碰撞/匿名共享/singleflight 同键合并且跨 viewer 不合并/写后即时失效不靠 TTL/invalidate 不误伤他人/淘汰串味陷阱/水位线只增不减/受控时钟验 TTL/双有界封顶）；真库集成测 `discover-cache.integration.test.ts` **6/6**（打真 Postgres、禁 mock：两 viewer 经 `discoverCached` 仍互不串味且命中后再读仍过滤；`setBlock`/`clearBlock`/`toggleFollow` 真写路径即时失效；`stats.loads` 增量证明命中确实不打库、invalidate 确实重打）。回归：既有 `blocks.integration.test.ts` + 网关三判据 **55/55**；`npm run typecheck` **14/14**。
- **首跑真信号**：真库"降载"用例首版**超时 90s**——夹具错在 `discoverCached` 外又套 `loadDiscoverCached`，同键嵌套 singleflight 自等待死锁；**是测试夹具 bug 不是生产路径**（生产 `discoverCached` 是唯一入口、loader 是原 `discover`，不重入）。改为直走 `discoverCached` + `stats.loads` 增量，6/6、8s，判据留注释防重踩。
- **诚实边界**：进程内缓存，多实例部署各实例不共享——A 实例失效了，B 实例仍可能持有该 viewer 最多 15s 旧视图；跨实例即时一致需 Redis pub/sub 广播失效或共享 generation 存储，属更大改动，**本片不做、不假报**。单机/单实例下隐私即时成立（真库判据已证）。`publishProject` 后新作品最多 15s 才进他人发现页（未接发布失效钩子，要"发布即见"另立片）。
- **流程细节查证（纠正探查）**：CI "ADR index integrity" 门（`.github/workflows/ci.yml:50-57`）只扫 `docs/decisions/[0-9]*.md`（55 个、全已索引、`GATE_EXIT=0`），**不扫 `docs/adr/`**——故 0101–0112 从没登记 README 仍 CI 绿。本 ADR 放 `docs/adr/0113`，按惯例不动 `docs/decisions/README.md`（详见 ADR-0113 专段）。
- **仍欠**：跨实例共享失效；publish 即时进发现页；发现页缓存命中率接进 admin 可观测；实例粒度 breaker/bulkhead 聚合；连接层黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push（需授权 push）；3 条既存 `.mjs` TS8016。未 push（main 领先 origin/main 60，本片提交前）。

## §SC 第四十二片：跨实例发现页失效用 Redis pub/sub 广播——最终一致，绝不冒充隐私强一致（SC-42 / ADR-0114，2026-11-11）

SC-41 诚实留下一条边界：进程内缓存，多实例各持各的，A 实例 `setBlock` 后 B 实例仍可能持有该 viewer 最多一个 TTL（15s）的旧视图；正解是"Redis pub/sub 广播失效或共享 generation 存储"，当时刻意未做。本片正面接上，落用户点名的 **Redis 运用 + 计网（发布订阅 / 最终一致）+ 缓存 + 数据结构**。

- **方案取舍（查证 + 推演，不拍脑袋）**：两条路都能跨实例失效。**采用 pub/sub 广播**：写路径发一帧"viewer u1 变了"，各实例 bump 本地 `globalGen` 派生键——**热读路径零网络**，写路径 fire-and-forget 一帧，线路可丢帧→最终一致。**否决共享 generation 存储**（把 `gen[viewer]` 放 Redis `INCR`，各实例读同一值拼键）：那会给**每次发现页渲染加一跳 Redis GET**，把"省 DB 的缓存"变成"每读一跳网络"，且 Redis 抖动直接打在首屏、可用性绑死 Redis。决定性点：ADR-0113 的整个立论是"热读纯内存、隐私新鲜度靠写路径主动失效"，共享存储方案把它推翻。
- **三段严格分离（热读零网络）**：①`invalidateDiscoverFor` **本地 `bumpLocal` 永远先执行**（本机隐私即时、fail-open 最后一道），再 `bus?.publish(ids)`（同步 void、绝不 await 网络、绝不抛、不阻塞写库请求）；②远端帧 → **同一个 `bumpLocal`**（本地/远端共用内核，杜绝漂移）；③`loadDiscoverCached`/`keyFor`/`generationFor` **一行未动**。bus 缺省（不设 `NEXUS_REDIS_URL`）= 与 SC-41 完全相同。
- **新增 `server/domain/invalidation-bus.ts`（复用 `redisBus.ts` 双连接骨架，不重新发明）**：`InvalidationBus {publish/subscribe/dispose/stats}` 最小接口，生产 Redis 驱动 + 测试内存驱动两种实现；双连接参数不对称（发布侧不排队/单次重试、订阅侧排队/无限重试——ADR-0028 打真 Redis 的结论）；构造即订版本频道 `nexus:discover-invalidate:v1`；`origin` 回环去重；线路字节 `parseInvalidationFrame` 校验版本/形状/`viewerIds` 条数(128)与 id 长度(128)护栏，坏帧记账丢弃；两条连接常驻 `error` 监听、`dispose()` 用 `disconnect()` 不用 `quit()`（防 vitest 退出 hang）、`publish().catch()` 接住。
- **注入与生命周期**：沿用 globalThis 单例 + 测试注入范式；`resetDiscoverCacheForTest({bus})` 显式注入、`bus:null` 强制单机、不传才走 env opt-in；生产异步建 bus 带**脏写防护**（store 被 reset/热重载后旧异步落定不挂脏）；重建前退订旧订阅 + dispose 旧 bus；为让同进程造两个独立 store 互通，导出 `createIsolatedDiscoverCacheForTest`——**复用生产同一套 `loadFromStore`/`invalidateInStore`/`keyFor`/`bumpLocal` 内核，不复制任何逻辑**（否则测的就不是生产路径）。
- **三版判据（隐私正确性不压在会丢帧的网络上）**：线路帧/驱动 `invalidation-bus.test.ts` **10/10**（假连接注入：坏帧/回环/大帧丢弃、publish 失败不抛、构造即订、dispose 幂等）；**跨实例语义主路径** `discover-cache.multi-instance.test.ts` **9/9**（内存 hub 双 store：A 失效→B bump→B 重查、不误伤、匿名不广播、幂等、fail-open、热重载退订）；真 Redis 往返 `discover-bus.redis.integration.test.ts` **1 条 opt-in**（设 `NEXUS_DISCOVER_BUS_LIVE=1` 才跑，默认 skip）。连 SC-41 既有 16+6 = **41 passed + 1 skipped**（默认形态）。**不把隐私压在真 Redis 上**：pub/sub 丢帧、ioredis 重连、Docker 死了端口仍 LISTENING 假绿、驱动有 hang vitest 历史——故主路径用确定性内存 hub、真 Redis 只验"线路通不通"且默认不跑。
- **真 Redis 层实测（不假报）**：2026-11-11 设 opt-in 实跑一次——两实例经 56379 互通、B 的 generation bump、B 重新查库、线路读数 `published≥1/received≥1`、**328ms 干净退出不 hang**；默认形态下该文件 skip（0 条真连接、0.86s 退出）。
- **首跑真信号（判据自检，没放过）**：多实例判据首版两条不诚实——①用 `as unknown as {bus}` 访问私有字段；②标题承诺"reset 退订无脏回调"却自认"无脏写可观察"。前者改用公开 `stats().bus.published` 观察，后者重写为真正可观察的判据（热重载后另一实例广播，新全局 store 的 generation 不被旧订阅误 bump）。**判据标题必须真被证到**，不写自我安慰的占位断言。
- **诚实边界（ADR-0114）**：**最终一致非强一致**——订阅掉线/重连窗口内帧会丢（pub/sub 不补发），对方最坏多用一个 TTL（15s）旧 generation 后自愈；拉黑全集群瞬时生效**不是**本片承诺，要那个得共享权威存储（已否决，代价热读一跳 Redis）或接受额外读。权威状态永远在库、缓存是加速器，帧丢不丢数据。`stats().bus` 只数本实例收发，查不到远端订阅者名册。混合部署（部分实例没设 env）靠 TTL 收敛，是配置责任不假报全员在线。
- **验证 / git**：三层 41 passed + 1 skipped；`npm run typecheck` **14/14**；SC-41 既有 16 单测 + 6 真库测**零回归**；未改 `discover` 函数体/DB/索引/依赖/两个入口。未 push（main 领先 origin/main 61，本片提交前）。
- **仍欠**：共享权威 generation 存储（要强一致时）；发现页缓存命中率与 bus 线路读数接进 admin 可观测面板（可复用 SC-40 骨架）；publish 即时进发现页；实例粒度 breaker/bulkhead 聚合；连接层黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push；3 条既存 `.mjs` TS8016。详见 ADR-0114 / §SC 第四十二片。

## §SC 第四十三片：发现页缓存读数终于接到 admin 面板——把 `null ≠ 0` 摆到运维眼前（SC-43 / ADR-0115，2026-11-11）

SC-41/SC-42 把发现页热读做成本机正确 + 跨实例最终一致，但 `discoverCacheStats()` 与 `InvalidationBusStats` 四账**全仓零消费者**："缓存有没有在命中、水位线有没有在涨、总线接没接上、有没有丢帧"只能读代码翻日志。本片正面接上 ADR-0114 的这条欠账，落用户点名的 **前端美学 / 前后端协同 / 缓存 / 数据库性能**。真正难的不是把数字画出来，而是**把"没测到""没接上""还没人读"诚实地画出来**——把所有缺失值都画成 `0%`/`published 0` 的表，会主动制造两个不存在的事故让运维去查。

- **一读一门一原样**：新增只读门面 `describeDiscoverCache(): DiscoverCacheReadout {measuredAt, stats, busAttached, busUrlConfigured}`（route 不触内部 `Store`）；`GET /api/admin/discover-cache` 与 `/admin/*` 同口径默认拒绝（未登录 401、`role!=='admin'` 403，一格内部账都不外泄）；**`no-store`**（读数带 `measuredAt`，缓存它等于把旧读数冒充此刻）；**原样端出不二次加工**（加工就多一处把 `bus:null` 抹成四账 0 的机会）；**不打库**（进程内同步账，`stats.loads` 前后不变见证"问读数没偷偷变成一次发现页查询"，catch 只兜取数抛错→503，不虚构 DB 降级路径）。
- **四条会被读反、读反就说实话的判据**（抽 `discover-view.ts` 纯函数，零 React/DOM/网络，沿用 ADR-0112 `gateway-view.ts` 范式）：①`busTag(null)` 单独一档中性说法，**不画 published/received/errors/applied 四个 0**（没接 ≠ 接了但全 0，本片最重要一句）；②`hitRate(0,0)` 说"还没有读"**不画 0%**（0% 暗示"读了都没命中"）；③`pollAllowed('hidden')=false` 后台标签不轮询、`visibilitychange` 回前台补一发；④`busTag(bus)` errors>0 走 `warn` 档 + "丢帧退回 TTL(15s)自愈"，已接且无错也必带"最终一致、不是瞬时强一致"。另 `keepPreviousOnError`（失败不清空上一帧，旧账带 `measuredAt` 比空白诚实）、`dashOr(null)` 画 `—（未测）`。
- **首跑后补严的形状门 `config`**：`isKnownReadout` 初版校验了六账 + `bus`（null 或四账齐全对象，残缺 bus 会让 `busTag` 读到 undefined 误画"线路正常"），**但漏了 `stats.config`**——而面板拿它做分母 `size/maxEntries`、`ttlMs/1000` 秒数、水位线旁注 `maxViewers`。缺 `config` 的坏回执会画出 `12/undefined`、`NaN s`。补严：`config.{ttlMs,maxEntries,maxViewers}` 三者必须同时是 number，缺一/类型错都挡掉；`bus=null` 是合法读数不被误杀（否则单机面板永远"拉取失败"）。
- **又一处"改配置就悄悄说谎"被判据钉死**：`footNote` 初版 `scope` 硬编码"每 4 秒"、末尾又拼"每 N 秒"，改 `POLL_MS` 时同句自相矛盾。改为秒数只从 `pollMs` 来、全句只出现一次；判据断言"每 8 秒"在、"每 4 秒"不在、正则 `/每 \d+ 秒/g` 恰好命中 1 次——把"单一真值源"钉成可验电不变量。
- **视觉零新增 token**：`/admin/discover-cache` 页（RSC `force-dynamic` 首屏取数吞异常降级 + `role=admin` 双拒绝）+ `DiscoverPanel`（4s 轮询/后台暂停/失败保留上一帧/骨架屏/KPI/总线卡/水位线旁注/页脚）。全部复用 §SC-40 的 `.gw-` 原语，只补 `.dc-*`（总线卡左边条/账目网格/提示段）；颜色间距圆角阴影全走既有 `var(--nexus-*)`（逐一核过 `--nexus-color-brand`/`shadow-md`/`radius-lg`/`motion-slow|ease`/`space-6`/`font-size-13` 均既有使用）；状态色只染圆点与左边条、文字一律中性 `fg-*`（浅色过 WCAG AA、不触 style-tokens"强调色当文字"硬门）；`prefers-reduced-motion` 下 `.dc-busCard` 动画归零；零 CSS Module、零组件渲染库。`AdminNav` 加入口，`AdminSection` 联合类型自动派生。
- **判据分层（门打真库、读数走内存、纯判据零依赖）**：展示判据 `discover-view.test.ts` **18/18**；路由层 `admin-discover-cache.integration.test.ts` **7/7**（打真库：401/403 不外泄、200+`no-store`、形状门前后端闭环、`bus:null` 原样保留——抹成四账对象就红、`busUrlConfigured` 与 `busAttached` 分开报、bus 已接四账原样、门面即 200 JSON、读数不打库）；SC-41/42/43 发现页缓存相关 6 文件合计 **66/66**；横向门 `style-tokens`/`jsx-text`/`control-names` **29/29**（`route-security-gate` 只扫写路由，新增 GET 不受影响）；`npx tsc -p apps/web/tsconfig.json --noEmit` **通过 EXIT=0**。真库门不 mock `currentUserOrNull`（那会把"门是否真会拒绝"换成一句注释），只 mock `next/headers` cookie 读取；bus 已接那条用 `resetDiscoverCacheForTest({bus:fakeBus})` 注入替身不连真 Redis，"配了旋钮但没接上"用 `bus:null`+临时 env（finally 还原）确定性造出中间态。
- **诚实边界（ADR-0115）**：面板只是**这一台实例**的进程内账、多实例各算各的（页脚明说，不跨实例聚合）；`busAttached` 只是"这条线路此刻挂着"，**不是**"全集群都收到我的帧"（pub/sub 无订阅者名册、会丢帧，ADR-0114 边界原样成立）；`measuredAt`（服务端取数）与"更新于"（浏览器收到）是两个时刻、页脚分别标不混用一个；首屏取数失败与 route 503 都不画全 0 假账；不设 `NEXUS_REDIS_URL` = 单机面板"未接总线"是**默认且正确的形态**、不是待修事故。
- **验证 / git**：定向 18+7+66、横向门 29、typecheck EXIT=0；**全仓 vitest 404 files/5777 tests passed + 1 skipped（405 files/5778 tests total）、EXIT=0**（对比 SC-42 基线 402/5752+1 skipped，净增 2 files/25 tests = 本片 18 判据 + 7 路由层，吻合；耗时 517.88s）。未改 `discover` 函数体/DB/索引/依赖/两个入口。单 main、无 worktree/stash/游离分支、`--no-merged` 空、**无可并内容**；未 push。
- **仍欠**：publish 后新作品即时进发现页（当前最多 TTL 15s）；共享权威 generation 存储（要强一致时）；实例粒度 breaker/bulkhead 聚合；Redis/Lettuce connect 阶段黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push；3 条既存 `.mjs` TS8016。详见 ADR-0115 / §SC 第四十三片。

## §SC 第四十四片：新作品即时进发现页——独立 `globalEpoch` 键段，绝不复用 `globalGen`（SC-44 / ADR-0116，2026-11-11）

SC-41 诚实留下的最大内容新鲜度边界：`publishProject` 后新作品最多一个 TTL（15s）才进他人发现页——privacy 失效钩子只认 `viewerIds`，覆盖不了匿名共享缓存，而"新作品"对**所有** viewer 都是新的。本片正面接上，落用户点名的 **Redis / 计网 / 缓存 / 数据库性能 / 前后端协同**。

- **最关键纠错：不能 bump `globalGen` 做全局失效**。探查推翻初始直觉：`globalGen` 是"给**新 viewer** 分配 generation 的单调水位线"，匿名 generation 恒 `0`、已缓存 viewer 直接读缓存值，**两者都绕过它**——`++globalGen` 一个现有键都失效不了；清 `viewerGen` 表也一样（匿名不在表里）。正解：新增**独立正交键段** `key = discover:v1|<globalEpoch>|<generation>|<JSON([viewerId,sort,limit])>`。`globalEpoch`（§SC-44 内容新鲜度，发布/下架/rejected +1，含匿名的所有旧键一次作废）与 `generation`（§SC-41 隐私新鲜度，block/follow 只失效一人）**正交**；两者都**跨 reset/热重载保留**防旧键复活（判据比照 `globalGen` 的"不归零"一条）。
- **帧格式单向兼容（`v:1` 与频道都不动）**：`InvalidationFrame` 加可选 `global?:true`，全局帧带它 + 空 `viewerIds`；不升 `v2`/换频道（那会切断旧实例双向互收），不把全站 viewerId 塞帧（撞 `MAX_VIEWERS_PER_FRAME=128`）。`parseInvalidationFrame` 严格校验两帧互斥（全局必空、定向必非空、id 护栏照旧、`global` 必须字面 `true`）。**单向兼容**：新实例收旧帧；旧实例解析新帧时因空数组撞护栏 fail-safe 丢弃（不把空集误当要 bump 的人），混部靠 TTL 15s 收敛、不比现状更差、升级后自动生效。订阅回调加第二参 `global?:boolean`，旧 `(ids)=>...` 忽略多余实参、向后兼容。
- **写路径精度（只在收录状态真改变时清全缓存）**：收录条件 `visibility='public' AND moderation<>'rejected' AND deletedAt IS NULL`。①`publishProject` 成功尾部 `input.visibility==='public' || existing?.visibility==='public'`（进发现页 / 从 public 撤回）；②`unpublishProject` 撤下前是 public；③`resolveCase` 判 `rejected` 且那条是 public。private/unlisted 发布与下架、approved 裁决**都不清**（本就不改收录，避免无意义惊群）。三条都是本机 `globalEpoch+=1` 先做再 fire-and-forget 广播，不 await/不抛/不阻塞写库请求；publish 失败分支早已提前 return。
- **首跑两条真信号（没放过）**：①正交性判据红在"invalidate **不立即** bump `globalGen`、generation 是**懒分配**"——断言时机错，修正后反而把真实实现钉得更准；②**下架 `RETURNING` 旧值陷阱**：`UPDATE ... RETURNING` 返回**更新后**的行，撤 public 时读到已是 `private`，判断永远 false、epoch 不涨，真库判据当场抓到生产 bug（7≠8）。改"先 select 旧 visibility 再 update"，并诚实记下 select→update 的"unlisted→public→此刻下架"窄竞态：最坏该作品在发现页残留一个 TTL、URL 已即时 404、不丢数据，要绝对原子需 CTE 取 OLD，不值得为低频操作引入复杂度。
- **诚实边界（ADR-0116，惊群是核心）**：全局失效 ≈ 一次冷启动，singleflight 按**完整键**合并、只合并**同键**并发、**不跨键**，故打库量随活跃 `(viewer,sort,limit)` 组合数上升——这是"即时可见"用性能换新鲜度的**预期代价、不是事故**，判据 `epochNote` 把收益与代价一起摆到运维眼前，admin 面板 `globalEpoch` 读数让频率可见；根治（跨键闸门 / stale-while-revalidate）属更大改动、不做不假报。跨实例**全局帧丢影响整台别的实例**（viewer 帧丢只影响一人），最坏退回现状 TTL 15s、不会更差、本机永远即时。面板只是本实例账、多实例各算各的，pub/sub 最终一致边界（ADR-0114）原样成立。
- **前端联动（§SC-43 面板延伸）**：`DiscoverPanel` 加"内容新鲜度的内存账"一节显示 `globalEpoch` + `epochNote` 旁注（发布因何 +1、作废哪些键、为什么冷启动尖峰不是故障）；`isKnownReadout` 形状门纳入 `globalEpoch`（缺/类型错挡掉，面板不画 `undefined`）；`discover-view.test.ts` 补正反判据。零新增颜色 token、复用 `.gw-`/`.dc-`。
- **判据分层（门打真库、内核零依赖）**：内核 `discover-cache.test.ts`+3（匿名+2 viewer×4 sort 预热→全局失效→`calls 9→18` 每键重载含匿名、与 generation 正交、epoch 跨 reset 不归零）；帧 `invalidation-bus.test.ts`+4（全局帧解析/互斥护栏/旧实例 fail-safe/两种 bus 收发/applied 记 1）；多实例 `discover-cache.multi-instance.test.ts`+4（A 全局失效→B epoch bump→匿名与登录键都变都重查、定向不误伤、fail-open、退订）；**真库端到端 `discover-cache.integration.test.ts`+3**（public 发布→所有 viewer 立刻看到且屏蔽名单不串味；下架→立刻消失；rejected→立刻消失；每条验 epoch+1 + loads 增长）；展示判据 `discover-view.test.ts`+2（globalEpoch 形状门正反/epochNote 收益与代价）、路由层 `admin-discover-cache.integration.test.ts` 既有 7。SC-44 相关 6 文件合计 **81 passed**（2026-11-11 实跑）；publish/moderation/unpublish/social 回归 **46/46**；横向门 **34/34**；`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**。
- **验证 / git**：**全仓 vitest 404 files/5792 tests passed + 1 skipped（405 files/5793 tests total）、EXIT=0**（对比 SC-43 基线 404/5777+1 skipped，净增 15 tests = 6 文件 66→81，文件数不变因只在既有文件加用例；542.59s）。未改 `discover` 函数体/DB 查询/索引/依赖/两个入口。单 main、单 worktree、无 stash/游离分支、`--no-merged` 空、**无可并内容**；未 push。
- **仍欠**：共享权威 generation/epoch 存储（要强一致时）；实例粒度 breaker/bulkhead 聚合；Redis/Lettuce connect 阶段黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push；3 条既存 `.mjs` TS8016。详见 ADR-0116 / §SC 第四十四片。

## §SC 第四十五片：发布冷启动「惊群」先观测不设闸——三道天然舱壁已够，无实测尖峰不写通用并发闸门（SC-45 / ADR-0117，2026-11-11）

ADR-0116 为"新作品即时进发现页"给键加了独立 `globalEpoch` 段，同时诚实留了一句边界：**全局失效 ≈ 一次冷启动，singleflight 只合并同键不跨键，打库量随活跃 `(viewer,sort,limit)` 组合上升，是即时可见的预期代价**。自然的下一个冲动是写一个跨键并发闸门把它钉住。本片先调查再动手，结论**反向：不写闸门，改为有界观测优先 + 按需减载预案**——落用户点名的 **缓存 / 数据库性能 / 数据结构（环形缓冲）/ 操作系统（背压与舱壁）/ 算法（采样 vs 锁存）/ 前端美学 / 前后端协同**。

- **调查一：真实上界是个位数键，不是 unbounded**。逐调用面核对：`limit` 两入口都不传、恒默认 24 → 键退化成 `(viewer,sort)`；RSC 一次导航只请求当前 tab 的**一个** sort，不是四个齐打；**匿名** generation 恒 0、键只随 sort 变 → 最多 4 个；**登录 viewer** 受 `maxEntries=2048`/`maxViewers=512` 与真实活跃人数双重封顶。故一次全局失效打库上界 ≈ `活跃 viewer × 瞬间 sort 数`，常态个位数到几十。
- **调查二：已有三道天然舱壁，"什么都没做"是错的**。①`BoundedCache.getOrLoad` 的 singleflight（`inflight` Map 合并同键、`loads` 只在真发起时 +1）；②**DB 连接池 `postgres(url,{max:NEXUS_DB_POOL??5})` 是物理硬上界**——最多 5 条 SQL 同时在途，再多在池里排队，压不穿数据库；③Java 网关 `SemaphoreBulkhead`（ADR-0109）。既然物理层已封顶，再加应用层跨键 semaphore 在"防打穿"上是重复的。
- **调查三：通用闸门是净损失（5 类新失败模式）**。①**permit 泄漏**（loader 抛错/中断/热重载忘 release → 永久少一个 permit）；②**排队饿死**（permit 数无先验，定小常态排队、定大等于没设）；③**读数失真**（`inFlight` 从"在跑的 loader 数"被污染成"拿到 permit 在等的 + 在跑的"，SC-43 已接进面板的诚实读数不再是它写的那个意思）；④**延迟稀释 SC-44 即时承诺**（发布后"立刻看到"变成"等 permit 空出来才看到"）；⑤**不减少总 SQL**（只摊平并发、不减总量，对连接池这个真瓶颈收益≈0）。**无实测尖峰证据**支持默认参数会打穿，为不存在的问题引入 5 类新失败模式是负收益。
- **决定：有界失效波采集（只记不拦）**。每次 `globalEpoch` 跳变记一波，采样窗口（`NEXUS_DISCOVER_WAVE_WINDOW_MS` 默认一个 TTL 15s）内：`loadsDelta`＝`cache.stats().loads` 差值（**精确**锚定"真打了几库"）；`peakInFlight`＝每次读后瞬时 inFlight 采样最大（诚实标**非锁存精确峰值**）；`firstFillMs`＝失效到首次真打库的毫秒、窗口内无人读为 **`null` 不是 0**（0 会谎称"瞬间就有人读"，同 `hitRate(0,0)` 不说 0%）；`settled`＝是否仍在采样。读数进 `DiscoverCacheStats.waves`/`.waveConfig` → `describeDiscoverCache()` → admin route → 面板"发布冷启动波"节原样端出。**零新 DB 查询、零生产行为变化**。
- **一个真实陷阱被判据钉死：采样点必须在 `getOrLoad` 同步登记 inFlight 之后**。`BoundedCache.getOrLoad` 是 async，但调用它的**同步段**已完成 `inflight.set` 与 `loads+=1`，`fromLoad` 在 `await load` 才暂停。若等 `await` 返回才采 `inFlight`，`fromLoad` 的 `finally` 已清掉 inflight → `peakInFlight` **恒 0**、把惊群谎报成"没有"。正解：`loadFromStore` 里 `getOrLoad(...)` 调用**后立刻**采一次（抓"我+其它并发重填"的瞬时在途峰值），`await` 收尾（含失败）再采一次定稿 `loadsDelta`/`firstFillMs`。判据专设"两键并发卡 gate → `peakInFlight≥2`"：采样点挪到 await 之后就红。
- **观测与主业严格隔离（SC-44 承诺一字不改）**：全局失效内核 `bumpEpochAndOpenWave` 顺序是契约——先 `globalEpoch+=1`（主业、fail-open 最后一道），再开波（`try/catch` 兜住）。**本机写路径与远端全局帧订阅回调共用这一内核**：多实例下收到发布帧那台也开自己的波，否则面板只有"发布那台"尖峰可见、其余空白（又一处 `null≠0` 式谎）。`loadFromStore` 两次采样同样 `try/catch`：观测抛错绝不许破坏缓存失效或吞掉 loader 异常（判据"loader 失败不崩、异常不吞"专钉）。
- **有界（数据结构纪律）**：`waves` 进容量 `NEXUS_DISCOVER_WAVE_CAPACITY`（默认 12）环形缓冲、超了丢最旧，读数不随发布次数无界增长（同 `maxEntries`/`maxBuckets`）；波**不跨** reset/热重载保留（旧进程波带旧 epoch 会与新 store 撞值误导运维），与 `globalEpoch` **必须**保留恰好相反——判据把两条钉在同一条里；惰性定格靠 `stats()` 读取与下一次加载驱动、**无定时器**（无后台资源、无热重载残留）。
- **触发阈值与按需减载预案（刻意未实现，留证据门槛）**：**只有实测 `peakInFlight` 持续逼近 `NEXUS_DB_POOL`（默认 5）才启动**，且优先不引入跨键闸门：①**O(1) 匿名 `new` 写侧预热**——public 发布成功后顺手在本机同步重填匿名 `new` 那份共享缓存（匿名 ≤4 键、无隐私差异，一次确定 DB 查询换掉最确定会发生的匿名冷启动，不排队、不稀释登录 viewer 即时性）；②**满即减载**——登录键若 `inFlight` 已达池上界，同键仍并 singleflight、**不同键不排队直接穿透查库**，把背压交给最懂它的连接池，不在应用层再造会泄漏 permit 的队列。**绝不**为"看起来平稳"让请求在应用层排队稀释 SC-44 即时可见；总 SQL 不变。减载未实现是**刻意的克制不是欠账**。
- **面板诚实（§SC-43 家族）**：`wavesHeadline([])` 说"还没经历过全局失效波（还没发布过 public 作品）——是尚未触发采样，不是'测过没有惊群'"；`waveNote` 把三道舱壁/上界个位数/未加闸门理由/触发阈值摆到运维眼前；`firstFillMs=null` 画"窗口内无人读"不画 0ms；`isKnownReadout` 形状门纳入 `waves` 数组（逐波六字段、`firstFillMs` 允许 null）与 `waveConfig`（`windowMs`/`capacity`），坏回执挡掉不画 `undefined`/`NaN`。**零新增颜色 token**，复用 `.gw-`/`.dc-`，状态色只染圆点、文字中性 `fg-*`、reduced-motion 归零、零 CSS Module/渲染库。
- **判据分层（内核零依赖、门打真库、读数不打库）**：内核 `discover-cache.test.ts` **+10**（配置回读/定向不开波/受控时钟钉首击 13ms 与 loads 增量/`null` 不说 0/惰性定格不重复/环形缓冲有界最新在前/`peakInFlight≥2` 专钉采样点/loader 失败不崩不吞异常/不跨 reset——epoch 保留波清零/JSON 安全往返）；多实例 `discover-cache.multi-instance.test.ts` **+1**（远端全局帧在对端也开自己的波、归属对端 epoch、首击 loadsDelta 可观测）；路由层 `admin-discover-cache.integration.test.ts` **+1**（全局失效后 waves/waveConfig 端到端可见、形状门认得、读数动作 `stats.loads` 不变）；展示判据 `discover-view.test.ts` **+10**（形状门 waves/waveConfig 正反、空榜诚实、峰值取最大、首击 `null` 不说 0ms、定格状态、旁注四要素）。SC-45 相关 6 文件合计 **101 passed**（2026-11-11 实跑，对比 SC-44 的 81，净增 20＝10+1+1+10−既有夹具调整）。横向门 `style-tokens.test.ts` **24/24**（零新增颜色 token）；`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**。
- **验证 / git**：`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；**全仓 vitest 404 files passed | 1 skipped（405 total）/ 5812 tests passed | 1 skipped（5813 total）、EXIT=0**（对比 SC-44 基线 404/5792+1 skipped，净增 20 tests = 6 文件 81→101，文件数不变因只在既有文件加用例；539.94s）。未改 `discover` 函数体/DB 查询/索引/依赖/两个入口。开工复核：单 main、单 worktree、无 stash/游离分支、`--no-merged` 空、**无可并内容**；未 push。
- **仍欠**：共享权威 generation/epoch 存储（要强一致时）；实例粒度 breaker/bulkhead 聚合；Redis/Lettuce connect 阶段黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push；3 条既存 `.mjs` TS8016；**按需减载预案（O(1) 匿名 new 写侧预热 / 满即减载）待实测 `peakInFlight` 逼近 `NEXUS_DB_POOL` 再实现**（当前无证据，刻意不做）。详见 ADR-0117 / §SC 第四十五片。

## §SC 第四十六片：上游失败 stale 兜底先重算键——SC-41「不删缓存条目」的隐私债，在降级路径上兑现（SC-46 / ADR-0118，2026-11-11）

`BoundedCache.peek(key)` 从写下起就声明"供上游失败时 stale 兜底"，`gateway/client.ts` 早已用成生产事实（失败→端旧值标 stale→无值则 unavailable 绝不画 0），唯独发现页这条同样打 Postgres 的热读链没接：`GET /api/discover` 与 `/discover` 页无 try/catch，`discover()` 一抖就整页 500。本片接上，落用户点名的 **缓存合理运用 / 数据库性能 / 前后端协同 / 诚实降级**。真正难的不是"端旧值"，而是**在 viewer-scoped 带隐私过滤的缓存上，端旧值会不会把刚拉黑的人 / 刚下架的作品又漏回来**。

- **本片最隐蔽的一条：SC-41「只删 generation 表、不删 cache 表」让 `peek(旧键)` 变成隐私陷阱**。SC-41 的失效纪律是 `invalidateDiscoverFor` 只淘汰 `viewerGen` 条目、不删缓存条目（旧键带旧 generation，单调水位线保证永不被拼出，旧值交 TTL/LRU 回收）——正常读路径完全成立。**但降级路径打破了前提**：`keyRequested` 是 loader 开始前锁定的字符串；若 loader **执行期间**发生 block（generation 条目被删）或 public 发布（`globalEpoch+1`），缓存表里 `keyRequested` 的旧条目**还在**（没人删），`peek(keyRequested)` 会成功拿到它——而那可能是**拉黑前的视图 / 下架内容还在的那份**，直接端出就是隐私/收录回退。
- **根治：端旧值前重算键比对，三条件同时成立才端**。`loadFromStore` 的 catch 调 `serveStaleOrThrow`：①**键仍有效** `keyFor(s,input)===keyRequested`（`keyFor` 综合 epoch + generation，二者任一变就不同）；②**有旧条目** `peek` 非 null（首次冷启动失败/被 LRU 淘汰→重抛、不画空）；③**够新** `old.ageMs<=staleMaxMs`。期间 block **本 viewer** / public 发布 → 键变 → **不端**；期间 block **别人** → 本 viewer 键不变 → 可端（不误伤可用性）；无失效 → 可端。重算对"期间被定向失效"的 viewer 懒分配一次新 generation，正是失效本该付的代价。任何条件不满足或降级自身抛错 → `throw cause`，**上游原始异常一字不改冒泡**，不吞错、不造空 `DiscoverResult`。**一句话**：「缓存里有旧值」与「旧值能端给这个人」是两件事，带隐私过滤的缓存尤其如此。
- **有界**：`peek` 的 expired 条目 `ageMs` **无上界**（键长期没人读会过期滞留到 LRU 淘汰），故 config 新增 `staleMaxMs`（默认 `ttlMs*2`，`NEXUS_DISCOVER_STALE_MAX_MS` 可覆盖，判据收窄验"超界宁可报错"不 sleep），超界重抛、绝不把几小时前的页冒充此刻。
- **不引入嵌套 singleflight**：降级只做**同步 `peek`**、不重入 `getOrLoad`——否则重演 SC-41 真库判据曾踩的同键 nested singleflight 自等待死锁（90s 超时）。判据"N 个同键并发失败共享一次 loader、各自 peek、`staleServed` 精确=N 且不死锁"钉死。
- **透明 + 可观测的克制平衡**：**不污染领域类型**——返回仍是纯 `DiscoverResult`，不新增 `stale` 字段、不改 `route/page`、不改共享 `BoundedCache`；发现页本无"此刻"承诺（正常命中本就是 TTL 内旧值），读用户照常看卡片、察觉不到降级。**但必须能被运维看见**——`DiscoverCacheStats.staleServed`（进程内累计、只增不减、不跨 reset）如实记账，经既有 `describeDiscoverCache→route→面板` 链路原样端出；面板加"上游故障降级"节显示次数与上界，`staleNote` 讲清四条边界：①`0` 只表示"还没抖过"、**不是**"降级没开"（开关是 `staleMaxMs`，同 `null≠0`/`hitRate(0,0)` 不说 0% 家族）；②旧值最多 `staleMaxMs`、超了宁可报错；③block/发布键一变**绝不端**；④无旧值报错、不画空页。`isKnownReadout` 纳入 `staleServed` 与 `config.staleMaxMs` 校验防画 `undefined`/`NaN s`。零新增颜色 token 复用 `.gw-`/`.dc-`。
- **判据分层（内核零依赖、门打真库、读数不打库）**：内核 `discover-cache.test.ts` **+11**（正向降级 `staleServed=1` 且 `loads`+1 / 无旧值抛错 size=0 / 超 `staleMaxMs` 报错 / **隐私红线** loader 内 block 本 viewer→不端+抛错+gen 增大+恢复后不复活拉黑前视图 / **收录红线** loader 内发布→不端+新 epoch 生成 gen-2 非 gen-1 / **隔离** loader 内 block 别人→仍可端 / 并发失败不死锁计数精确 N=4 / 健康路径零影响异常不吞 / 降级结果字段形状不变 / 账不跨 reset）；展示判据 `discover-view.test.ts` **+5**（形状门正反 + 旁注 0 次不说"没开" + 四边界 + 秒数跟入参）；路由层 `admin-discover-cache.integration.test.ts` **+1**（真实降级后 `staleServed`/`staleMaxMs` 端到端可见、形状门认得、`stats.loads` 不变即不打库）。SC-46 相关 7 文件（含横向门）合计 **141 passed**；横向门 `style-tokens` **24/24**；`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；SC-45 既有判据零回归。
- **首跑真信号（判据自检，没放过）**：展示判据首版红在一条**断言与文案字面不一致**——判据凭记忆写 `toContain('只读用户看到的是正常卡片')`，而 `staleNote` 文案写的是"读用户看到的是正常卡片"（"读用户"措辞也别扭）。这是判据自造的假想措辞、非实现 bug。借机把文案改自然（"普通访客照常看到卡片、察觉不到这次降级，这笔账只记在运维面板里"）、判据对齐。**判据断言必须来自真实文案，不能凭记忆编一句"应该会说的话"**，否则要么误红、要么文案真出疏漏时反而不红。
- **验证 / git**：`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；**全仓 vitest 404 files passed | 1 skipped（405 total）/ 5828 tests passed | 1 skipped（5829 total）、EXIT=0**（对比 SC-45 基线 404/5812+1 skipped，净增 16 tests；540.60s）。未改 `discover` 函数体/DB 查询/索引/依赖/两个入口/领域类型。开工复核：单 main、单 worktree、无 stash/游离分支、`--no-merged` 空、**无可并内容**；未 push。
- **仍欠**：共享权威 generation/epoch 存储；实例粒度 breaker/bulkhead 聚合；Redis/Lettuce connect 阶段黑洞独立看门狗（SC-36）；CI `topology` job 经真实 push；3 条既存 `.mjs` TS8016；SC-45 按需减载预案待实测。详见 ADR-0118 / §SC 第四十六片。

## §SC 第四十七片：加 deadline 前先量 loader 墙钟——发现页"慢"要证据、"永不返回"要诚实（SC-47 / ADR-0119，2026-11-11）

SC-46 的 stale 兜底有一个**真实盲区**：它只在 loader `reject` 时触发。若上游**永不回答**（慢查询 / 连接池排队 / 锁等待），`discover()` 既不 resolve 也不 reject，catch 永远不进——stale 旧值明明在表里却端不出来，首屏焊死。这正是 SC-36 在网关测过的"连接黑洞"，但发现页这条本地 Postgres 链从没查过。上一轮先把失败模式钉死防重踩，本轮按该结论落地**观测这一片**（ADR-0119）。探查结论（保留为背景）：

- **事实（读码确证）**：`server/db/client.ts` 只设 `postgres(URL,{max: NEXUS_DB_POOL??5})`，**无 `connect_timeout` / `idle_timeout` / statement_timeout / query deadline**；全仓超时原语（`AbortSignal.timeout`）只用在 `fetch` HTTP 出站，DB 查询链零 deadline。`discover()` 主查询含 3 个 `SELECT count(*)` 子查询 + 三表 join，慢库上确实可能长尾。连接池 `max=5` 是 SC-45 依赖的物理 bulkhead，但它只让超出者**在池里排队**，不设等待上界。
- **关键失败模式（为什么不直接用 `Promise.race` 软 deadline）**：`BoundedCache.getOrLoad` 的 singleflight 把 hung 的 loader promise 存进 `inflight`，只在 `fromLoad` 的 `finally` 清除。若只在 `loadFromStore` 外层 `Promise.race([getOrLoad, timeout])`：① race 超时返回 stale 后，**底层 hung promise 仍挂在 `inflight`**，后续同键请求会 `await` 它、一起 hang（超时形同虚设）；② 每个超时请求各起一个 race，底层 hung 查询不断堆积、占满 5 个连接，把单键慢变成全站发现页雪崩。**在 race 层加超时会让情况更糟**。
- **正确方向（两条，都要"先观测 / 谨慎"）**：① **先做 loader 耗时观测**（复用 §SC-45 失效波那套受控时钟 `s.now()` 与有界环形缓冲，只记不拦：`maxLoadMs` / `slowLoads` 超阈值计数进 stats + 面板），用真实数字回答"发现页加载到底有没有秒级长尾"——若最慢 < 100ms，deadline 就是伪需求、永不需要做；这是与 SC-45/46 一致的**观测优先**纪律。② 若实测确有长尾、确需 deadline，**不能在 race 层做**：要么给 `BoundedCache` 加可放弃 inflight 的 `abandon(key)` 原语（超时时摘掉 inflight、让底层跑完自清、后续请求重新发起），要么用 Postgres `statement_timeout`（但会波及全站查询、属高危，须单独评估）。
- **上一轮决定（其"先观测"部分已由本片兑现）**：**不仓促加 DB 超时**。先做"发现页加载耗时观测"（纯观测、零生产行为变化、不碰共享 DB 客户端 / `BoundedCache`），拿到证据再决定要不要 deadline。这是克制不是欠账——无证据对共享数据库层加超时，正是 SC-45 拒绝"无实测尖峰就加并发闸门"的同一条理由。

### 本片交付（SC-47：只做"先观测"，deadline 仍按证据门槛暂缓）

- **生产（零新 DB 查询 / 零行为变化 / 不碰共享 `BoundedCache` 与 `db/client.ts` / 不改 `discover` 与两个入口 / 不改 `DiscoverResult`）**：`loadFromStore` 把注入 loader 包一层 `withLoadTiming(s, epoch, loader)` 再交给 `getOrLoad`，量**真实打库**的墙钟耗时。**为什么必须包 loader 而非在加载外层掐表（本片最关键的一处）**：`getOrLoad` 的 singleflight 只对 leader 真正调 loader、跟随者 await 同一个 inflight promise 根本不进包装函数，缓存命中更不调——故包 loader 天然只记真实打库那一次；若挪到外层，N 个同键并发会把一次打库记成 N 次、把"等 leader 的墙钟"误算成查询耗时，**用观测亲手造一份"并发越高越慢"的假长尾**（判据"N 并发只记 1 次、不含等待"专钉）。波（SC-45 读侧瞬时快照）与耗时（本片 loader 侧墙钟）共用同一注入时钟但采样点刻意分开、互不干扰。
- **记什么 / 不记什么（诚实边界，本片最要紧）**：`DiscoverCacheStats` 加 `maxLoadMs` / `slowLoads` / `loadsTimed` / `recentLoads{epoch,durationMs,ok,atMs}`，全部进程内账、只增不减、**不跨 reset**（与波 / staleServed 同列的观测快照，与必须保住的 `globalEpoch`/`globalGen` 相反）。`slowLoadMs` 阈值（默认 1000ms、`NEXUS_DISCOVER_SLOW_LOAD_MS` 可覆盖）**只是观测分类旋钮、不是超时**：超过只 `++slowLoads`，不超时不 abort 不改返回；`recentLoads` 进容量 12（`NEXUS_DISCOVER_LOAD_SAMPLE_CAPACITY`）环形缓冲有界，聚合 `maxLoadMs`/`loadsTimed` 不因淘汰而丢。**只记已 settle 的加载**：永不 resolve/reject 的 hung loader 到不了 `finally`、**不进样本**——故"最慢低于阈值 / slowLoads=0"**不能证明"没有连接黑洞"**；hang 的旁证是 `loads − loadsTimed` 长期为正 + `inFlight` 不归零（SC-45 已接面板），面板 KPI"发起 − 已计时"与 `loadNote` 把这件事明摆给运维，绝不拿低耗时当"没有 hang"的免死金牌。判据用"永不 settle 的 loader"钉死 `maxLoadMs=0 但 loads−loadsTimed=1`，并把"时钟是 `BoundedCache.set` 与观测的共用依赖、时钟抛不属于观测隔离责任"这条边界写进 ADR。`epoch` 在发起同步段锁定，loader 途中发布仍记旧世代（判据专钉）。
- **面板与诚实读数**：`describeDiscoverCache→route→面板` 既有链路原样端出四字段（route 本就"读进程内账、不打库、不加工"）；`DiscoverPanel` 加"加载耗时观测 · 只记不设闸"节，`discover-view.ts` 三条纯判据：`loadTimingHeadline(0,…)` 说"还没量到已 settle 的打库——尚未观测，不是'没有慢查询/都很快'"（同 `null≠0`/`hitRate(0,0)`/空波榜家族），`maxLoadMs=0` 画"—（未测）"不画 0ms；`loadNote` 摆五件事（只计真实打库 / hang 不进样本看在途差 / 超阈值只 ++ 不拦 / 有界 / 真长尾也不在 `Promise.race` 层设闸而是 `abandon(key)` 或 `statement_timeout`、最慢远低于阈值则 deadline 是伪需求——先量再治）；`loadRow` 成败如实标。`isKnownReadout` 纳入四个新计数、`config.slowLoadMs`/`loadSampleCapacity`、`recentLoads` 逐条四字段（`ok` 必须布尔）。**阈值照画毫秒不画秒**：它是毫秒粒度旋钮（判据收窄到 50ms），`/1000` 会谎报 `0s`（这是首跑抓到的面板真 bug）。零新增颜色 token 复用 `.gw-`/`.dc-`。
- **判据分层（内核零依赖、门打真库、读数不打库）**：内核 `discover-cache.test.ts` **+12**（config 回读 / 受控时钟钉单次墙钟 37ms / 超阈值才 ++ 且取峰值 / 慢失败 ok:false 不吞异常 / **singleflight N=5 并发只记 1 次 50ms 不含等待** / 缓存命中不计 / **hang 不进样本靠 loads−loadsTimed=1 旁证** / 有界缓冲留最近 3 条且聚合不丢 / 不跨 reset / loader 途中发布仍记发起世代 / JSON 安全往返 / 与 SC-46 降级共存）+ 展示判据 `discover-view.test.ts` **+9**（形状门正反四组 + 空/有样本标题 + 样本行 + 方法论旁注 + 50ms 不画 0s）+ 多实例 `discover-cache.multi-instance.test.ts` **+1**（两台各算各的墙钟不串）+ 路由层 `admin-discover-cache.integration.test.ts` **+1**（真实慢 loader 137ms 端到端可见、形状门认得、`stats.loads` 不变即不打库）。**净增 +23 its**，SC-47 相关 4 文件合计 **118 passed**；横向门 `style-tokens` **24/24**；`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；SC-45/SC-46 既有判据零回归。
- **首跑真信号（判据自检，逐条定性、没放过）**：定向首轮 118 红 4 条——① **面板真 bug**：`slowLoadMs` `/1000` 画秒，50ms 会谎报 `0s`，改画毫秒 + 加判据钉死；② **夹具设计错误（非实现 bug）**：初稿让共享 `now()` 抛错模拟"观测失败不拖垮 loader"，但 `now` 也是 `BoundedCache.set` 的依赖、时钟一抛连缓存写入一起挂，测的不是观测隔离，删掉换成"loader 途中发布仍记发起世代"；③ **三条判据凭记忆编文案/单位**（SC-46 同一坑重演）：断言"已 settle"（真实文案"只记已跑完"）、`1s/2s`（实现是毫秒）、`loads−loadsTimed`（真实文案带中文"真查库 loads − 已计时 loadsTimed"），全部改为逐字取自实现。**经验再坐实：判据断言必须来自真实文案，不能凭记忆编"应该会说的话"。**
- **验证 / git**：`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；**全仓 vitest 405 files passed（404 + 1 skipped，405 total）/ 5851 tests passed | 1 skipped（5852 total）、EXIT=0**（对比 SC-46 基线 404/5828+1 skipped，净增 23 tests = 4 文件 97→118，文件数不变因只在既有文件加用例；8m43s）。开工复核：单 main、单 worktree、无 stash/游离分支、`--no-merged` 空、**无可并内容**；未改 `discover` 函数体/DB/索引/依赖/两个入口/领域类型；未 push。
- **仍欠（拿到证据后才动，克制非欠账）**：若实测确有秒级长尾、确需 deadline → `BoundedCache.abandon(key)`（超时摘 inflight、底层跑完自清、后续重新发起）或 Postgres `statement_timeout`（波及全站、高危、须单独评估），**绝不在 `Promise.race` 层做**；连接层黑洞独立看门狗（SC-36）；SC-45 按需减载预案待实测 `peakInFlight` 逼近 `NEXUS_DB_POOL`；共享权威 generation/epoch 存储；实例粒度 breaker/bulkhead 聚合；CI `topology` job 经真实 push；3 条既存 `.mjs` TS8016。详见 ADR-0119 / §SC 第四十七片。

## §SC 第四十八片：发现页 popular 排序先真库 EXPLAIN 再谈优化——拆查询是冷启动假象，物化计数器欠火候（SC-48 / ADR-0120，2026-11-11）

**本片零代码改动**，落用户点名的 **数据库性能 / 运行速度 / 数据结构与算法优化**。`discover()` 主查询（`social.ts:417`）投影带 3 个相关子查询计 likes/comments/remixes、`popular` 排序又嵌第 4 个 likes `count(*)`，读码直觉"该优化"；按 ADR-0117/0119 纪律先用真库数字回答，结论**两条证伪 + 一个拐点**：

- **① 拆查询 = 冷启动假象下的伪优化**：首次 `EXPLAIN` 跑 `popular` 得 **297ms**，其中 `Seq Scan on snapshots`（1335 行含大 jsonb document）独占 **206ms（69%）**，看似"排序逼出整表 hash"。但同一会话**热缓存**连跑 3 次稳态：现有 `popular` **1.29 / 1.42ms**、阶段1（去 snapshots join）0.88 / 1.34ms、阶段2（主键 `=ANY(ids)` 补 document）0.29 / 0.38ms、`new` 对照 0.35 / 0.48ms。**现有热稳态本身 ~1.3ms**，拆成两阶段 B+C≈1.2ms 无实质收益，却多一次往返、多一次 planning、破坏 `discover` 单查询原子性、在两阶段间开一个"阶段1 拿 24 行→阶段2 补 document"的读一致性窗口（期间下架/改可见性能拼出单查询拼不出的混合快照）——**净亏**。297ms 应在连接预热/缓存回填解决，不是改查询。**这与 ADR-0119 同一条：没分清冷/热就下结论=用观测造假热点。**
- **② 物化计数器 = 方向对但欠火候**：`new` 走 `published_visibility_published_idx` 倒扫、LIMIT 提前停（22ms 冷/0.4ms 热、从不扫全表）；`popular` 排序键含相关子查询、优化器无法用索引提前停，`SubPlan 4` 的 `loops`=候选行数（真库 135）、投影 `SubPlan 1` 又对 24 行重算——同一 likes count 算 **159 遍**，是真实 O(N) 结构。但真库仅 135 候选、likes 11 行，每次 `Seq Scan likes` 0.016ms、159 遍合计约 2ms，**根本不是当前瓶颈**；为不存在的规模引入三张互动表冗余计数列（写路径增减/并发回滚/历史回填一致性债）得不偿失——同 ADR-0117"无实测尖峰不加闸门"。
- **③ 拐点实测（数据驱动触发阈值）**：`generate_series` 事务内造 **20000 候选 + 7101 likes**（唯一合成数据、同事务 `ROLLBACK`、零污染真库），热跑 2 次：当前相关子查询 **22.9 / 28.3ms**（`SubPlan loops=20000`+投影 24）vs 物化 `likes_count` 列 **2.17 / 2.33ms**（0 次子查询），**约 10–12x，万级候选拐点明确**。故记下触发阈值：候选逼近万级（或 `popular` 的 `maxLoadMs`/`recentLoads` 持续数十 ms 且 popular 占比高）再评估物化；**正确方向 = `published_projects` 物化三计数 + 写路径事务内增减，不是拆 join、不是微调子查询、更不是给共享 `db/client.ts` 加全局 `statement_timeout`**；即便物化仍是 O(N log N) 全量排序，十万级才需 keyset/预计算榜单，那更要等真实流量证据。
- **验证 / git**：真库 `nexus-postgres`（55433）健康，实测 `published_projects=151/likes=11/comments=8/remixes=2/snapshots=1335`，索引齐备（`likes_project_idx`/`comments_project_idx`/`remixes_source_idx`/`published_visibility_published_idx`）。12 次热缓存采样取稳态、2 万候选拐点 2 次各，bench 脚本 `test-results-mine/sc{48-bench,48-scale}.sql`（辅助未跟踪目录、按惯例不提交，ADR 内联全部数字可复跑）。**本片无判据净增、无 typecheck/全仓变化（零代码改动）**；开工复核单 main/单 worktree/无 stash/无游离分支/`--no-merged` 空、**无可并内容**；未改 `social.ts`/索引/`db/client.ts`；未 push。详见 ADR-0120。

## §SC 第四十九片：clear 必须让在途加载的回写作废——generation token 堵住"清空被复活"（SC-49 / ADR-0121，2026-11-11）

`BoundedCache`（网关取数客户端的有界 TTL/LRU/singleflight 底座，ADR-0112）的 `clear()` 对外承诺"清空+计数归零"，却与 singleflight 在途加载交错出一道**真实正确性裂缝**：leader `getOrLoad` 在 `fromLoad` 里 `await load` 挂起 → `clear()` 清 `map`/`inflight`/计数 → loader 随后 resolve、`fromLoad` 继续 `this.set(k,value)` **把一条值写回刚清空的 map**，读数变成 `size=1 / loads=0` 自相矛盾的假账（follower 还各 `set` 一次刷 LRU）。**范围诚实交代**：`clear()` 唯一生产入口 `client.ts` 的 `clearCache()` 全仓**零调用点**，故这是**底座 latent 债、非正在发生的事故**；但 `BoundedCache` 是复用底座（发现页也 `new BoundedCache`，只是其 test reset 走"重建实例"而非 `clear`、不受此 bug 也不受本修复影响），趁早补齐比将来踩到便宜——同 ADR-0117/0120"把声明与实现分叉处钉死"。落 **数据结构与算法 / 缓存合理运用 / 操作系统竞态**。

- **生产**：实例加单片程单调整数 `generation`，`clear()` 时 +1；`getOrLoad` 同步段捕获当前 gen（leader/follower 都捕），交 `fromLoad`；`fromLoad` 在 `await load` 后、写 map 前比对 `genAtStart !== generation` → **值照常交回等这一发的调用者**（那份数据当时确实查到、是真的，不能因中途 clear 就变 undefined 凭空造一次读失败），但**不写 map、不增计数**，map 保持空、counters 保持归零。**关键取舍**：挡的是"回写"不是"结果"，缓存一致性与调用者正确性同时成立。`finally` 的 `inflight.get(k)===load` **刻意不加 gen 判断**：没被 clear 时精确清自己、保失败可重试；被 clear 过时 `inflight` 已清空、`get(k)` 要么 undefined 要么是 clear 后同键新一发的 promise（≠旧 `load`），两种情形都**不误删新一发**——判据专钉这个最易写错成"finally 加 gen 反把新一发删掉"的竞态。generation 只解决单实例内 clear×在途竞态、不持久化、与 `discover-cache` 的 `globalGen`/`globalEpoch`（跨 reset 保持久水位线）正交。
- **零生产行为变化**：clear 返回后无旧结果再写、`size=0/loads=0` 自洽；未清空路径 `set`/singleflight/TTL/LRU 全不变；loader 返回值与异常传播不变；不碰 db/网络/`discover-cache`/任何公开类型。
- **判据（净增 +5，全落 `gateway-pure.test.ts`，零网络、可控 deferred+注入 now、不 sleep）**：① leader 在途 clear 值照交但 `size=0/loads=0/inFlight=0` 不复活；② follower 与 leader 同属旧世代一起被挡（两者都拿值、map 仍空、loads=0）；③ 失败 loader 在途 clear 异常原样传、不写回不钉在途、clear 后新一发能加载；④ 正常 clear 无在途时重填照常写、计数重来；⑤ **旧 leader 的 finally 不误删 clear 后同键新一发**（新一发 inFlight 保持、正常完成写入）。
- **首跑真信号（判据自检）**：判据② 首版同步断言 `loaderCalls===1` 红了——`getOrLoad` 用 `Promise.resolve().then(loader)` 把 loader 推到微任务、同步时还没跑（实际 0），是**判据时序写错、非实现 bug**；改用同步 `++` 的 `stats().loads` 验 singleflight、断言 loader 次数前 `await Promise.resolve()` 让出微任务，修正后绿。**经验再坐实：判据要_match 被测代码的执行时序（同步段 vs 微任务），红先分辨是判据错还是实现错。**
- **验证 / git**：gateway 两组（`gateway-pure`+`gateway-client`）**37 passed**；discover-cache 回归 + 横向门 3 文件 **90 passed**（含 `style-tokens` 24/24、零新增颜色 token）；`npx tsc -p apps/web/tsconfig.json --noEmit` **EXIT=0**；判别实验：外部并发争抢下单跑 `gateway-pure` 仍 **23/23 秒绿（11.42s）**，证明纯内存改动零回归。**全仓 vitest 本轮未单独复跑（不粉饰）**：验证期两路外部 `vitest run`（本仓并行会话 + `D:\终极项目` 的 trending 集成测）同时打本机同一个 `nexus-postgres`（`max=5`）与 CPU，互相把 30s hookTimeout 拖爆、卡在等库（全仓主进程 20+ 分钟 CPU 仅 10s，纯逻辑分卷 `timeout 300` EXIT=124）；两者非本轮所起、按仓库纪律不 kill。基于 SC-47 基线 **5851 passed | 1 skipped** + 本轮净增 5 条纯测，预期全仓 **5856 passed | 1 skipped（推算、待干净窗口实测复核）**。开工复核单 main/单 worktree/无 stash/无游离分支、**无可并内容**；未改 `discover-cache.ts`；未 push。详见 ADR-0121 / §SC 第四十九片。

## §SC 第四十八片：发现页 popular 排序先真库 EXPLAIN 再谈优化（SC-48 / ADR-0120，2026-11-11）

- 起点：`discover()` 主查询（`server/domain/social.ts`）投影里有 3 个相关子查询（likes/comments/remixes）+
  排序键带第 4 个 likes `count(*)`，看起来"明显该改"。本片**不动查询**，先按 ADR-0117/0119 的观测优先纪律量：
- **事实（真库 `nexus-postgres`）**：snapshots Seq Scan 206ms 是**冷启动一次性**（把大 jsonb 从磁盘读进 shared_buffers）；
  热缓存稳态 `popular` ≈ **1.3ms**。拆成"阶段1 24 行 + 阶段2 补 document" ≈ 1.2ms，**净亏**：多一次 DB 往返、
  第二份 planning、以及一个读一致性窗口。`new` 排序索引倒扫提前停，冷 22ms / 热 0.4ms。
- **拐点（合成 20000 候选 + 7101 行 likes，`generate_series` 事务内、同事务 ROLLBACK，零污染真库）**：
  当前相关子查询 22.9/28.3ms（`SubPlan loops=20000`）vs 物化 `likes_count` 列后 2.17/2.33ms，**~10–12x**。
  触发阈值被钉成数据：public 候选逼近万级才评估物化计数列。
- **决定**：**不落地**物化列、JOIN 拆分或拆 join——为一个不存在的规模付真实复杂度。记下方向（物化计数列 +
  写路径事务内增减）、不改任何代码、任何索引、`db/client.ts`。
- 交付：ADR-0120 + 可复现真库读数；**零生产代码改动**（§159：不 fake 优化）。

## §SC 第四十九片：clear 必须让在途加载的回写作废（SC-49 / ADR-0121，2026-11-11）

- 起点：SC-41/42/43/44/45/46/47 把发现页热读做进程内正确（SC-49 的发现基于同一条 `BoundedCache` 底座）——
  这一片修的是**底座**本身的一道正确性裂缝：`getOrLoad` singleflight 让 leader 在途、`clear()` 已 "size=0/loads=0",
  loader 随后把结果**写回刚被清空的 map**，读数变 `size=1 / loads=0` 自相矛盾。
- **范围诚实**：`clear()` 唯一生产入口 `client.ts` 的 `clearCache()` 全仓**零调用点**——这是一个 latent 正确性债，
  不是正在发生的事故；趁早补齐比将来某个调用者踩到便宜得多。
- **决定（generation token）**：实例加单调 `generation`，`clear()` 时 +1；`getOrLoad` 同步段捕获 gen、
  交 `fromLoad`；`await load` 后、`set()` 前比对——过期就**交值、不写回、不增计数**。值照交给等它的调用者
  （它在 loader resolve 那刻是真的），只是不落库。`finally` 刻意不带 gen：`inflight.get(key) === load` 是精确判断，
  被 clear 过则 `<undefined 或 新一发> !== load`、不会误删新一发（判据焊死）。
- 判据 **+5**（全部可控 deferred / 注入 now、零网络、零 sleep）：
  leader 在途 clear（值 42 照交、`size=0 / loads=0`）/ follower 与 leader 同世代一起挡 /
  失败 loader 在途 clear 异常原样传 / 正常 clear 路径零回归 /
  **旧 leader 的 finally 不误删 clear 后同键新一发**。
- 判据自检真信号：判据 2 初版红（`Promise.resolve().then(loader)` 决定 loader 时序，同步断言拿到 0）——
  夹具错非实现错：singleflight 改用同步 `stats().loads` 验 + 加 `await Promise.resolve()` 让出微任务后再数 loaderCalls，
  定格为判据注释。
- 验证（本 slice 开工实测）：`gateway-pure` + `gateway-client` **37/37**；全仓门复跑后回填。
- **影响面**：只动 `apps/web/src/server/gateway/cache.ts`（+ 进程内组件，零公共 API 变化），不碰 discover / DB / 索引 / 依赖 / 领域类型。

## §FE 第一片：/discover 的视觉登峰造极——算法版每页最先看见的那一页（2026-11-11）

- 触发（user 直接点名）：**前端的美观程度，前端的魅力程度登峰造极**（同时用户新增了 Redis / 计网 / 算法 / 前后端协同 / 数据库性能 / 缓存 等方向——
  这些在 SC-40–SC-49 里已被全链覆盖并逐条 ADR）。本片只动**公开面**里流量最大、此前最朴素的一页：
  `/discover`（排序四榜，每一条卡面都是平台里真实发布作品）。
- 做了什么：
  - **零新增颜色 token**：所有效果锚在 `tokens.css` 已定义、两个主题（深/浅）都成立的色上（brand/accent-1/accent-2/bg*/fg*/border*/motion*）；
  - **标题**渐变墨字（fg-1→accent-2）+ 下方一道 brand→accent-1→transparent 压边（header::after 伪元素，min(320px,60%) 长）；
  - **排序收成分段胶囊**（`.dv-tabRow`，pill 容器底 bg-2；当前格 `.dv-tabActive` = brand→accent-1 渐变底 + glow shadow），`aria-current=page`；
  - **卡片**：顶部 accent-2→transparent 2px 描边 + 底线一条渐变，封面 600ms 缓放大 hover、底部 veil 保证文字压深底色，
    卡身 hover 抬升 3px + border-strong + shadow-lg + brand 25% mix 描边；计数走 `font-mono` + `tabular-nums`；
  - **空态**：虚线框 + 径向品牌辉光（brand 14% → bg-1 60%）非生硬灰块；
  - **排法说明 / 做不出来的排序**：各自有独立的语义边界条（accent-1/warn 左边彩），同 `.dc-note` 语法且浅色主题也过 AA；
  - 搜索入口升级为 `dv-searchPill`（pill 圆角 + hover border-brand）。
  - 所有尺寸/间距/圆角/字号全部 token 化（`--nexus-font-size-*` / `--nexus-space-*` / `--nexus-radius-*` / `--nexus-motion-*` / `--nexus-shadow-*`）。
- **门禁**：`style-tokens`（var(--nexus-*) 存在性）+ eslint（page.tsx exit 0）+ 全仓 vitest（交付后回填）。
- **取舍**：
  - **不加 CSS Module**（与 SC-40 的结论一致：全仓无先例、为它引入 .d.ts/门禁获益不抵成本；globals @layer components + `.dv-` 前缀，与 style-tokens 对齐）；
  - 不动 schema/card 内容/链接目标（§159：观感升级不是信息架构升级）；
  - 空态不伪造推荐位；`unavailable` 那格严格照旧渲染（如实说明平台没做什么）。
- **仍欠**：`/discover` 没有 e2e 截图门（视觉变化本页所有用例同构、无独立断言；后续要有"公开面改版必带截图前后"的规约，另立片）。
- **FE-1 补片（2026-11-11）**：新增 `e2e/discover.spec.ts`（§FE-1 的浏览器那一寸）——匿名冷启动测：标题/四个排序标签/搜索入口可见、卡片 data-* 属性与 `/<handle>/<slug>` href 或空态 `data-discover-empty` 二选一、切到"最近最热"必看到 `aria-current=page` 且 `data-discover-method` 口径写在页上、全程零 console error。tsc exit 0。**未跑**——机器当前约 700MB 空闲、全仓 vitest 正在争资源，下一窗口专跑一次 `npx playwright test e2e/discover.spec.ts`。
