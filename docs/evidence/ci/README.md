# The CI WIRING — a red proof that fails nothing

This directory exists because the wiring is a subject. `.github/workflows/ci.yml` is the repository's only
workflow, and until amendment 514 it ran `typecheck`, `lint`, `test` and `build` and **no `verify:*` step at
all** — so a proof could go red, stay red for hundreds of commits, and cost the build nothing. That is not a
footnote to the evidence tree; it is the reason the evidence tree can rot.

## The wiring that makes a red proof fail the build is itself graded (M0/v528 — ADR 0016 amendment 514)

```
npm run verify:proofs      # the build's own row: run every derived proof row, exit 1 on any RED
npm run verify:ci-wiring   # the gate over the wiring itself (and a row inside the set it enumerates)
node docs/evidence/ci/ci-wiring-arms.mjs   # 32 witness arms, by hand — see below why it is not a row
```

| § | what `ci-wiring-proof.mjs` refuses |
| --- | --- |
| 1 | `on.push.branches` does not include `master`, the branch this lane pushes |
| 2 | no step runs the derived proof set, or more than one step does |
| 3 | a verdict is swallowed (`|| true`, `continue-on-error`, `set +e`), or a `||` carrier is named but no longer needed |
| 4 | the proofs run before `npm run build` — these proofs read `dist`, which the build writes |
| 5 | the derived population does not close as `runs + named residue`, or a row's file is not on disk |
| 6 | an EXCLUDED row states a reason its own file never reaches in code |
| 7 | `verify:proofs` points at a runner that is not on disk |
| 8 | `verify:ci-wiring` is absent from the running set it just enumerated |
| 9 | the CI runner and the agents sweep disagree about the budget grammar, or a row's marker is REFUSED |
| 10 | the build's Node cannot carry the type-stripper these proofs import |

### What each piece is

- **`tools/ci/proof-set.mjs`** (the runner `npm run verify:proofs` calls). Its population is **derived, not
  copied**: every `verify:*` script in `package.json` whose whole command is one `node` call under
  `docs/evidence`. Add a script, add a build row; delete one, lose a build row. A script pointing at a proof
  file whose bytes are gone is a RED, not a skip — that is a door nobody opened. Rows the build machine cannot
  run are `EXCLUDED` by name, each naming the external service it needs, and the residue is printed rather
  than hidden.
- **The budget is the row's, and it is one grammar.** The runner **imports `rowBudget`** from
  `docs/evidence/agents/sweep.mjs` instead of restating it, so the agents sweep and the build read the same
  function, the same `// sweep-budget-ms: N` first-column marker, and the same code-position tokenizer
  (amendments 85 and 94). A kill is a `TIMEOUT`, a different verdict from a failure — amendment 85 refused to
  let "slow" and "wrong" share a word.
- **`docs/evidence/ci/ci-wiring-proof.mjs`** is the gate, and it is `verify:ci-wiring`, i.e. **a row inside the
  set it enumerates** (amendment 102: a census that contains the counter must count it).
- **`docs/evidence/ci/ci-wiring-arms.mjs`** is a human-run tool, deliberately **not** a `verify:*` script, so
  the derivation can never schedule it. It rewrites one byte-range of one plane file per arm and accepts the
  arm only when the gate reddens at exactly the clause the arm aimed at.

### Why §9 reads refusals first

Measured while writing this gate: its own prose wrapped a `// sweep-budget-ms: N` example into column 1, and
the CI reader **refused** the marker. The note was honest and nobody read it at the moment of the ship, which
is the exact failure amendment 85 named. So §9 asserts "0 refused" **before** it asserts that some row
declares its own budget — a mis-spelled marker now reddens with the sentence that names it, instead of
silently running on the 240 000 ms fallback and reporting that nothing is declared.

### Measured, on the day it shipped (2026-10-28)

`npm run verify:proofs` on Windows: **12/12 green of a derived population of 15 · residue named: 3**, 294.6 s,
slowest row `verify:mutation` at 272.7 s inside its declared 1 200 000 ms. `verify:ci-wiring` exits 0 with all
ten clauses printing. **32 witness arms, 32 MATCHED** — 17 against the gate (a control that must reach all ten
clauses, then one per refusal) and 15 against the runner on a synthetic plane of 6 stub rows plus the 3 shipped
exclusions, where the stubs append to a log so "did anything execute" is measured rather than assumed.

### What this does NOT claim

Deriving the population has a limit listing does not have to admit: a module under `docs/evidence` that was
never turned into a `verify:*` script stays invisible to the build. At this ref 109 tracked `.mjs` modules sit
under `docs/evidence/` while 15 are rows. Wiring the rest is the next repair, named and not claimed — amendment
516's census below closes the invisibility half of that hole and wires the four that need nothing but Node. And
no gate here can make GitHub run: it reads bytes committed in this repository, and whether the workflow now
executes on `master` is knowable only from the first real run — it ran red (`40603544099`, amendment 515's four
exec-host cases on ubuntu) and then green (`40659064493`), which is the evidence this section was waiting for.

## The evidence census — every tracked module is a row, a helper, a swept proof, a tool, or a deferral (M0/v530 — ADR 0016 amendment 516)

```
npm run verify:evidence-census   # a row inside the population it counts
```

Every tracked module under `docs/evidence` now has a disposition, and the build re-derives all of them:

| class | count at this ref | how it is decided |
| --- | --- | --- |
| ROW | **20** (17 run + 3 excluded) | a `verify:*` script whose whole command is one `node` call into `docs/evidence` — proof-set's own `PROOF_COMMAND`, imported, never retyped |
| HELPER | **3** | import closure from every `verify:*` node target and every declared tool, through `sweep.relativeSpecs` (code position only): `agents/sweep.mjs`, `lib/syncproc.mjs`, `m9/wire-fields.mjs` |
| SWEPT | **79** | the agents sweep's own population, read by CALLING `sweep.trackedProofs('HEAD')` — the human-run channel is named, not guessed from a filename shape |
| TOOL | **6** | declared in the proof's `ROSTER` with a reason and a command a reader can re-run (two mutation probes, two arms scripts, the isolated-build arms, the SVG generator) |
| DEFERRED | **3** | the three Studio lane proofs — green on the authoring box, blocked on the build plane's missing `node:22-alpine` pre-pull; each names its blocker and v531 as the repair, and all three are printed on every run |

Anything else is `UNCLASSIFIED` and exits 1 naming the file. Stale records are refused too: a roster entry the
commit no longer owns, a declaration shadowing a derived class, a reason a reader cannot falsify, a row target
the commit does not own, an import of a file the commit does not own, an exclusion that retires no row. **14
fixture arms** prove each refusal on a synthetic plane; the prose-import arm proves the tokenizer is the sweep's,
not a byte regex.

Four rows that needed nothing but Node walked through the door in the same increment:

| row | proof | measured on the authoring box (2026-10-28) |
| --- | --- | --- |
| `verify:audit-contract` | `m9/audit-contract-proof.mjs` | 4.2 s — reads the service's Java record and the client model, then asks the TypeScript compiler |
| `verify:record-encoding` | `agents/record-encoding-proof.mjs` | 4.4 s — the record corpus's encoding census (120 000 ms own budget) |
| `verify:pipeline` | `studio/pipeline-proof.mjs` | 0.7 s — prompt → design-model ops → layout → undo/redo → AI diff |
| `verify:table-recount` | `agents/table-recount-proof.mjs` | 38.2 s — boots vitest and reconciles this directory's README table (300 000 ms own budget) |

Two of them (`record-encoding`, `table-recount`) are ALSO in the agents sweep's population; the census prints
that overlap every run — double coverage, not a conflict.

**Measured, on the day the census shipped (2026-10-28).** `npm run verify:evidence-census` prints **111 tracked
modules = 20 row + 3 helper + 79 swept + 6 tool + 3 deferred · 0 unclassified · rows 17+3**, with **14/14 arms
MATCHED**. The derived build population is now **17 running + 3 excluded** (12+3 at v528). The first fully green
CI run (`40659064493`, the push that carried amendment 515) executed `Build` and `Evidence proofs` on ubuntu
for the first time: **12/12 rows green in 35 s**, `verify:mutation` 33.1 s (272.7 s on the Windows box — the
runner's own declared budget is unchanged). The four new rows' ubuntu verdict is knowable from the next run,
the same bound amendment 515 stated.

**What the census does NOT claim.** It classifies the 79 swept proofs; it does not run them in the build — the
agents sweep stays the human-run channel, with its own budgets (240 000 ms default, 3 600 000 ms ceiling). It
does not wire the three deferred lane proofs: `--pull never` means a fresh build plane must already hold
`node:22-alpine`, and v531 is the named repair. The closure reads `from '…'` and `import('…')` through the
sweep's tokenizer; a bare side-effect `import './x.mjs'` is not read and would surface as an orphan (a RED),
not as a silent helper — no tracked module uses that form at this ref. And a module on disk that the commit
does not own is invisible by design: the population is the INDEX's, because CI can only run what the commit
owns.
