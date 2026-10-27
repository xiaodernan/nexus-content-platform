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
under `docs/evidence/` while 15 are rows. Wiring the rest is the next repair, named and not claimed. And no
gate here can make GitHub run: it reads bytes committed in this repository, and whether the workflow now
executes on `master` is knowable only from the first real run.
