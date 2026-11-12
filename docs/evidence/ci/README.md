# The CI WIRING — a red proof that fails nothing

This directory exists because the wiring is a subject. `.github/workflows/ci.yml` is this lane's workflow —
since cf1537e (2026-11-09) the repository has a second one, `.github/workflows/main-line.yml`, and until clause
§14 arrived nothing in this directory read it — and until amendment 514 ci.yml ran `typecheck`, `lint`, `test`
and `build` and **no `verify:*` step at all**, so a proof could go red, stay red for hundreds of commits, and
cost the build nothing. That is not a footnote to the evidence tree; it is the reason the evidence tree can rot.

## The wiring that makes a red proof fail the build is itself graded (M0/v528 — ADR 0016 amendment 514)

```
npm run verify:proofs      # the build's own row: run every derived proof row, exit 1 on any RED
npm run verify:lint-tree   # the tree's own lint door: 19 derived areas, one ESLint child each, vs lint-debt.json
npm run verify:ci-wiring   # the gate over the wiring itself (and a row inside the set it enumerates)
npm run verify:arms        # the witness arms — a row since v555 (the set's own size is in its receipt)
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
| 11 | the job declares no time ceiling, one that is not a whole number or under 5 minutes, one at or above the sum of the rows' own budgets (no outer bound at all), no `permissions:` block or an empty one, a write scope, or a token that lacks `contents: read` |
| 12 | a running row's last source print opens on a housekeeping tag (`[cleanup]`/`[teardown]`/`[finally]`/`[housekeeping]`), so the gutter keeps the sentence about deleting a temp directory instead of the measurement |
| 13 | a running row's final print literal is longer than the gutter's room, so its last line can only arrive severed — the runner marks the cut, the clause refuses the size |
| 14 | a script declares a `tsc -p` leg that no step of **any** workflow file reaches, or a package `tsconfig*.json` names no leg and extends nothing — either way a typecheck surface exists that CI never grades |

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
- **`docs/evidence/ci/ci-wiring-arms.mjs`** is `verify:arms` — **a row since v555**, after the reason that kept it
  human-run was measured and found false: every arm rewrites a COPY of the gate or the runner inside a plane
  under `../nexus-ci-arms-plane-<pid>`, and the tool's only in-tree write (the receipt) now happens only when
  its content would change. It rewrites one byte-range of one plane file per arm and accepts the arm only when
  the gate reddens at exactly the clause the arm aimed at.
- **`tools/ci/lint-tree.mjs`** is the second door the build walks (`verify:lint-tree`), and a `runner` in the
  manifest census rather than a row: its command is `node tools/ci/lint-tree.mjs`, outside `docs/evidence`, so
  the admission rule that derives rows cannot derive it. Its 19 areas come from `git ls-files`, so a new
  top-level directory is graded the day it is committed and there is no list to forget; the two areas it
  excuses each state the reader that excuses them, and the gate re-derives that reader every run. It spawns
  one ESLint child per area because one process over 1117 files is one heap, and it grades its own verdicts on
  15 planted shapes before it reports a single real finding.

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
exclusions, where the stubs append to a log so "did anything execute" is measured rather than assumed. *(This
is v528's roster, kept as the record of the day; v540 re-armed the tool, found three of these arms had gone
stale in the clauses they were meant to guard, and the current roster is 40 — see below.)*

### v540 — the job's own envelope, and the arms that had stopped being runnable (ADR 0016 amendment 523)

§11 charges what the ten clauses above it could not see: the per-row budgets bound the **proofs** step, and
nothing bounds `npm ci`, typecheck, lint, test, build or `docker pull` — a stall there is bounded only by the
platform's 6-hour default, and the row budgets cannot see it because they start counting later. The job now
declares `timeout-minutes: 60` and `permissions: contents: read`. The clause refuses a missing ceiling, one that
is not a whole number or under 5 minutes, one at or above the rows' own worst case (98 running rows: 92 ×
240 000 ms + the six declared = 25 500 000 ms ≈ 425 min — a ceiling that high is not an outer bound, it is the
rows' budgets in another unit), a missing or empty `permissions:` block, a write scope, and a token that lacks
`contents: read`. Measured: `[§11] job ceiling 60 min is BELOW the rows' own worst case 425 min
(98 rows) · token narrowed to [contents: read] · no write scope`.

The first **re-run** of the arms since v531 is also this increment's evidence about itself, and it found that
the instrument had rotted while the table kept quoting it. A8 crashed at load: its needle assumed the Build and
Evidence proofs steps were adjacent, and v531's docker pre-pull has stood between them ever since — the arming
script for §4 had been un-runnable while this section kept saying "32 MATCHED", a number measured at v528. A14
exited 0: it deleted one `// sweep-budget-ms` marker by name, which armed "nobody declares a budget" when one
row declared one (v528) and stopped arming it when six did (v540) — it now derives its edit set from the running
population. R2b was a witness that could die of load: it passes `--budget 600` to the whole synthetic plane, and
on a busy box a healthy stub took 0.7 s and was killed before the row under test spoke; every stub now declares
its own budget, and the row under test carries 30 000 ms over a 1.5 s loop. The `splice()` guard that refuses a
mixed-EOL carrier was written with a lookahead (`/\n(?!\r)/`) that flags every ordinary CRLF ending, so the first
derived needle into a pure-CRLF proof (`table-recount-proof.mjs`) was refused as "mixed" — a one-character
guard bug, never seen because every carrier the hand-written arms edit is LF. And A19 earned its §11 arm the
hard way: widening the token reddened one assertion EARLIER than the sentence it names, because §11 checked
`contents: read` before the write refusal — refusals now precede adequacy checks. The roster is closed in both
directions (every printed clause has an arm; every arm aims at a printed clause), and it is **40** (25 against
the gate — a control plus one arm per refusal, §11 carrying eight — and 15 against the runner): **40/40 MATCHED**.

The bound this paragraph leaves standing is the honest one: the arms are still a human-run tool, and nothing
schedules them. v540 measured them and repaired what their first run since v531 found; it did not make
the next rot announce itself. A number in this file is only as fresh as its last run.

### v542 — the arms' verdict gains an expiry date (ADR 0016 amendment 525)

`ci-wiring-arms.mjs` is still human-run, but a run in which every arm matched now writes
`docs/evidence/ci/arms-receipt.json`: the sha256 of every subject it graded — the workflow, the gate, the
tool itself, the runner, the sweep whose budget grammar §9 borrows, the two `package.json` entries the gate
names, and the rule module — plus the derived population as (row, file, budget marker). A red run writes
nothing, and a run whose subjects move under it refuses to stamp bytes no arm graded.

`verify:arms-freshness` is the build row that reads it: §1 the receipt exists and claims a full matched run
(scope, counts and arm names all agreeing), §2 every subject on disk still hashes to what the receipt stamped
(a vanished subject is named as the stronger change), §3 the derived population still closes as the receipt's
rows, files and markers, §4 the receipt's own population lists this row (amendment 102). A mismatch prints the
subjects and the command that refreshes the receipt. Hashes canonicalise line endings, because the receipt is
written on Windows and read on the ubuntu runner — a raw-byte hash would stamp the platform, not the content.

Measured on this ref: the tool's full run **40/40 MATCHED** (2 m 55 s), receipt 40 arms / 7 subjects / 102
rows; `verify:arms-freshness` prints all four clauses and its **8/8 fixture arms** measure each refusal on a
synthetic plane (F1 → §2, F2 → §3, F3/F4/F5 → §1, F6 → §4, F7 → §2, the control all four). The first fixture
run matched 4/8 for a reason worth recording: a throwing judge never returns the clauses it already printed,
so every post-§1 arm was misreported as "§1 did not print" — the harness now captures `pass()` lines as they
are logged. A witness that misaims its own frontier is the same class of rot the receipt exists to catch.

The expiry is honest about its reach: it says that a subject CHANGED, never that an unchanged arm still tests
the right thing. A weakened arm that still reddens at its own clause is outside this row; the roster closure
(every printed clause has an arm, every arm aims at a printed clause) and review are what stand there.

Run `40830721516` (sha `0c03476`) is the first green build with this row: **99/99 of a derived population of
102**, `verify:arms-freshness` **OK 0.1 s** on ubuntu — the receipt written by a Windows checkout matched the
runner's bytes, which is the EOL-canonicalisation working — and `verify:door-kill` **OK 0.8 s** on its first
ubuntu contact after the v542 repair. Job **10 m 01 s**, proofs step **8 m 02 s**, still far under the
60-minute ceiling and the read-only token.

### v543 — the table that restates these numbers is now checked by the census that derives them (ADR 0016 amendment 526)

v542's own increment found this file quoting two numbers that had stopped being true — the v540 section still
said the arms roster was 35 after v540 measured 40, and the "at this ref" sentence still carried v533's
111 modules / 84 rows — and the repair was by hand. That is the same class of rot the receipt exists to catch
one directory over. The census now reads this file and recomputes every derived number in it: the five class
counts in the table below, the `(N run + M excluded)` split inside the ROW cell, the "every one of the **N**
tracked modules" sentence, and the "**N running rows + M excluded by name** at this ref" sentence. A
disagreement is a red naming the README's number beside the census's, and a table the reader cannot parse is
a red asking for the edit — never a silent skip, because a check that skips is the same class as a clause
that can never fire (v539's `drive-axis`).

The numbers it compares against are derived at run time, never restated: the rows from
`derivePopulation(pkg.scripts)` minus `EXCLUDED`, the classes from the census's own pass over
`git ls-files`, the population from the index. Measured at this ref: `README docs/evidence/ci/README.md:
ROW 102 = 99 run + 3 excluded · HELPER 4 · SWEPT 2 · TOOL 6 · DEFERRED 0 · 114 tracked — the table and both
prose numbers agree with this run`, in 3.7 s on this box.

Six fixture arms drift one number at a time on the synthetic plane — R1 the ROW total, R2 the run/residue
split, R3 the HELPER count, R4 a vanished class row, R5 the tracked-prose count, R6 the "at this ref" split —
and the census now runs **20/20 MATCHED**. Each arm replaces one literal on its plane; a needle that misses
leaves the plane green and the arm reports ARM FAILED, so an arm cannot decay into a no-op the way one of the
wiring arms did at v540.

The reach is stated: the reader grades the table and the two sentences that claim to describe THIS ref, not
the run-by-run paragraphs below them. Those are records of their day (v528's "32 witness arms" stays 32), and
a count inside one of them is history, not a restatement. Where the table itself is reshaped, the census
reddens until this reader learns the new shape; that is the intended cost of checking a document written for
people.

### v545 — an exclusion whose stated need was one pull step: the leak-sweep row is wired, and its image is in the runner's cache before the row is timed (ADR 0016 amendment 528)

- **What the exclusion said, and what was true.** `EXCLUDED` carried three proofs; the leak-sweep entry named "a docker daemon that can pull and run pgvector/pgvector:pg16 — its §5 is a real container, not a stub". The workflow has pulled `node:22-alpine` on this runner since v531 and `ubuntu-latest` ships a docker daemon, so the only unmet part was the IMAGE. An exclusion whose whole blocker is one `docker pull` is a claim the build can satisfy — and a row kept out of the build by a satisfiable need is a proof nobody runs.
- **Measured before wiring.** On the authoring box (docker server 29.9.2), `node docs/evidence/m7/leak-sweep-proof.mjs` exits 0 in **18.4 s**: §5 stages a real `nexus-publish-e2e-db-<stamp>-999999999` container, the sweep retires it as `owner-gone` (8 s old), and `docker ps` no longer lists it. The proof's own bytes are unchanged by this grant.
- **The change.** The workflow's docker step pulls both images, and its comment states why the second pull sits OUTSIDE the row: a pull inside it would spend the row's 240 s budget on the registry. The `EXCLUDED` entry is deleted, not reworded — the rule v531 applied to the three lane proofs. The census's two derived cells moved from `99 run + 3 excluded` to **100 run + 2 excluded**.
- **Red, then green, in the census's own sentences.** With the entry deleted and the table untouched, `verify:evidence-census` refused with exactly two: "the README's ROW row says 99 run + 3 excluded; this census derived 100 run + 2 excluded" and the same split in the "at this ref" sentence. After the cells moved it reads `114 tracked modules close as 102 row + 4 helper + 2 swept + 6 tool + 0 deferred · 0 unclassified · rows 100+2`. `verify:ci-wiring` reads the same split, and the rows' worst case moves 429 → **433 min** under the 60-minute ceiling.
- **The arms had to follow.** A11's needle was the retired row's `needs` line, so the arm edited nothing and the tool refused to certify it ("the needle … occurs 0 times, and an arm that edits nothing — or two things — grades nothing"); R9 crashed on the same constant, and the synthetic plane still counted nine rows (it ran the leak-sweep stub as a live row and answered `7/7 green of a derived population of 9`). A11/R9 now aim at the live-stack row that remains, and the plane stays NINE rows — seven stubs plus the two exclusions — because R6 deletes one row and must still stand at eight, above the floor, or its own clause would be unreachable; `verify:arms-freshness` named `workflow, runner` the moment the subjects moved, and the re-armed receipt is a full **40/40**.
- **Bounds.** The row's first ubuntu contact is measured: run `40845243190` (sha `64265d1`) is **green in 10 m 28 s** — the pre-pull step 9 s, and `verify:leak-sweep docs/evidence/m7/leak-sweep-proof.mjs [default 240000ms] ... OK 0.5s`, the population reading `100/100 green of a derived population of 102 · residue named: 2`. §5 sweeps the whole docker host, which on a hosted runner is empty apart from the orphan it just staged (one VM per job). The other two exclusions stay — the live stack and maven+PostgreSQL — and ci-wiring §6 still proves each excluded file reaches a real capability outside its comments.

### v546 — an exclusion whose reason described a DIFFERENT file: publish-proof is a row, and the runner pins JDK 25 (ADR 0016 amendment 529)

- **What the exclusion said, and what the file does.** The live-stack entry said the proof "publishes through tools/harness/studio-publish.mjs against a service that answers". `docs/evidence/m7/publish-proof.mjs` never mentions that harness — `grep -c studio-publish` returns 0 — and the harness is its own script, `verify:publish-e2e`, which lives under `tools/` and is therefore outside the derived population by construction. The reason had been carried over from the other proof: it was a sentence about `verify:publish-e2e` attached to a file that starts its own service and speaks HTTP itself.
- **Measured before wiring.** On the authoring box (Temurin 25.0.1 · Maven 3.9.15 · docker server 29.9.2), `node docs/evidence/m7/publish-proof.mjs` exits 0 in **2 m 16 s**: it built the jar from an isolated copy, started its own `pgvector/pgvector:pg16` container on a free port, published and re-published, restarted the service and read version 2 back from the database, ran the owner chain, the audit trail and the search, and removed both the process and the container. Through the real runner (`node tools/ci/proof-set.mjs --only verify:publish`) it reads **`OK 176.1s` · `1/1 green of a derived population of 103 · residue named: 1`**. Nothing about the proof changed; the only edit to it is the budget it now declares.
- **The change.** The workflow pins the toolchain with `actions/setup-java@v4` (temurin 25, `cache: maven` keyed on `services/nexus-api/pom.xml`) before the proofs step: the image's DEFAULT JDK is 17 while the proof asserts `/version "25/`, and ambient JDK selection is the same trap the proof's own comment records for configuration. The image already carries Maven 3.10.0 and v545 put the pgvector image in the cache; the row declares `// sweep-budget-ms: 900000`, because the expensive part on a fresh runner is the COLD local Maven repository (warm here 2 m 16 s; the same `package -DskipTests` against an EMPTY local repository measured **1 m 49 s** on this box; the proof's own Maven call is allowed 600 s).
- **Red, then green, in the census's own sentences.** With the entry deleted and the table untouched, `verify:evidence-census` refused with exactly two: "the README's ROW row says 101 run + 2 excluded; this census derived 102 run + 1 excluded" and the same split in the "at this ref" sentence. After the cells moved it reads `115 tracked modules close as 103 row + 4 helper + 2 swept + 6 tool + 0 deferred · 0 unclassified · rows 102+1`. `verify:ci-wiring` reads the same split and names the new declaration — `verify:publish=900000ms`, 8 of 102 rows declaring their own — and the rows' worst case is **458 min** under the 60-minute ceiling.
- **The arms had to follow.** A11/R9's needle was the retired row's `needs` line, so both now aim at the maven+PostgreSQL row that remains; the synthetic plane stays NINE rows by growing a stub (eight stubs plus the one exclusion) — R6 deletes the excluded row and must still stand at eight, above the floor, or its clause would be unreachable. `verify:arms-freshness` named the moved subjects, and the re-armed receipt is a full **40/40**.
- **Bounds.** `verify:publish-e2e` — the real-browser harness the old sentence actually described — is NOT wired and stays outside the derived population: it drives a real Chrome through `tools/`, which the admission rule excludes by construction, and wiring it is a separate admission question that this row does not answer.
- **The first ubuntu contact, measured.** Run `40920204170` (sha `1b2a0e0`, 2026-10-29) carries the row's first hosted-runner verdict: `verify:publish docs/evidence/m7/publish-proof.mjs [declared 900000ms] ... OK 39.0s` — the pinned JDK 25, the pre-pulled images and the declared budget were enough, and the proof's own §1–§9 passed on ubuntu. That run is RED overall, but on a DIFFERENT row: `verify:package-counts` (the product lane's v549 table gate), whose refusal and repair are v550's subject. The publish row's first contact is closed.

### v547 — the last exclusion, whose stated need was a database the tests never open: the service suite is a row, and the offline run's repository is bought ONLINE first (ADR 0016 amendment 530)

- **What the exclusion said, and what is true.** The last `EXCLUDED` entry said `docs/evidence/m7/service-suite-proof.mjs` needed "maven and a real PostgreSQL — it grades the surefire XML written by `mvn -B test` on services/nexus-api". Measured, there is no database in that suite: all **20** `*Test.java` files use `@ExtendWith(MockitoExtension.class)`, and `SpringBootTest|Testcontainers|PostgreSQLContainer|JdbcTemplate|DriverManager|getConnection` occur in **0** files — the service's PostgreSQL driver is there for the application, not for its tests. The proof runs `mvn -o -B test`, OFFLINE, so the real prerequisites were a JDK 25 (the pom sets `java.version` 25 and `<release>25</release>`), Maven, and a warm local repository for `-o`. The reason was the same class as v545 and v546: a sentence that outlived the file it described.
- **Measured before wiring.** On the authoring box (Temurin 25.0.1 · Maven 3.9.15), `node docs/evidence/m7/service-suite-proof.mjs` exits 0: §0 Maven answers · §1 digests **86** service source files → `b4fa34d49cd20e2e` · §2 `mvn -o -B test → exit 0 in 52.7s` · §3 digest unchanged before and after · §4 **400 tests in 20 class(es) · failures 0 · errors 0 · skipped 0 · per-class sum 400 agrees** · §5 nothing under `services/nexus-api` is uncommitted. Through the real runner (`node tools/ci/proof-set.mjs --only verify:service`) it reads **`verify:service docs/evidence/m7/service-suite-proof.mjs [declared 1200000ms] ... OK 49.9s`** · **`1/1 green of a derived population of 103 · residue named: 0`**.
- **The change.** The entry is deleted, not reworded (`EXCLUDED = []`; the array stays because the gates read it), and the row declares `// sweep-budget-ms: 1200000` — its own Maven call is allowed 900 s, so a 240 s default would kill the row INSIDE the build. The workflow gains one step before the proofs: `mvn -B -q -f services/nexus-api/pom.xml test`, the ONLINE half. `cache: maven` restores only what a PREVIOUS job saved, so the first run after any pom change starts with an empty `~/.m2`, and the row's `-o` would redden on a missing artifact rather than on a test. The warm-up runs the exact lifecycle the row grades; the row re-runs it offline and reads its OWN surefire XML, digesting the service sources before and after.
- **Red, then green, in the census's own sentences.** With the entry deleted and the table untouched, `verify:evidence-census` refused with exactly two: "the README's ROW row says 102 run + 1 excluded; this census derived 103 run + 0 excluded" and "the README's \"at this ref\" sentence says 102 running + 1 excluded; this census derived 103 + 0". After the cells moved it reads `115 tracked modules close as 103 row + 4 helper + 2 swept + 6 tool + 0 deferred · 0 unclassified · rows 103+0`. `verify:ci-wiring` now says `[§5] derived population 103 = runs 103 + named residue 0` and `[§6] the residue is EMPTY at this ref — every one of the 103 derived rows runs`, names `verify:service=1200000ms` among **9** declaring rows of 103, and the rows' worst case moves 458 → **478 min**, still above the 60-minute ceiling.
- **The §6 clause and its arms moved in opposite directions.** With no residue left, §6 prints its emptiness rather than falling silent (a clause that stops printing is a sentence nobody can see), and A10/A11 PLANT the exclusion they test by splicing one entry into the `EXCLUDED = []` declaration — A10 an entry for a pure-node proof (the reach rule), A11 one whose reason is `'docker'` (the states-nothing rule). The runner half's synthetic plane is **nine stubs and no excluded row**: R4 asserts the list reads `runs 9 + excluded 0` and prints no EXCLUDED line, and R6/R9 splice their own entry into the plane's runner. `verify:arms-freshness` named the moved subjects (`workflow, gate, arms, runner`) the moment the wiring's bytes moved; the re-armed receipt is a full **40/40** over **103 derived rows**.
- **Bounds.** The row's first ubuntu contact is measured: run `40928766201` (sha `1c21bbd`) reads `verify:service docs/evidence/m7/service-suite-proof.mjs [declared 1200000ms] ... OK 8.1s` after its warm-up step ran the same lifecycle under Temurin 25.0.5 — the offline suite answers on the hosted runner, and the whole population reads 103/103. The warm-up step adds the suite's runtime to the job (52.7 s warm here; the runner's first run also pays the dependency download, which is what `cache: maven` is for). The suite grades the WORKING TREE and says so (§5); on the runner the tree is the checkout, so "uncommitted" is empty by construction. And `mvn -o` closes Maven's network, not JDBC — the no-database fact above is measured from the test bytes (20/20 Mockito, 0 connection classes), not inferred from the flag. The proof's totals come from Maven's OWN stdout (`Tests run: … -- in <class>` lines), not from surefire XML left on disk: a stale report cannot answer for the run.

### v550 — a generated table can still lie about a tree nobody can check out, and a red that prints only its headline cannot be read: `--write` refuses a dirty measurement, and the runner prints the whole cause (ADR 0016 amendment 531)

- **The red, and what it hid.** Run `40920204170` (sha `1b2a0e0`) is red on `verify:package-counts [declared 600000ms] ... RED 68.2s` — the product lane's v549 table gate — and the log carries exactly one sentence: "the package table drifted from the suites it describes — regenerate it with `node docs/evidence/studio/package-counts-proof.mjs --write` and re-read the diff:". The seven `pkg: the table says N; the suite answered M` sentences that named the drifted rows were the assertion's own continuation lines, and `causeOf` kept only the first line (it trimmed, filtered blanks and returned `named.slice(0, 400)`), so the build's red could not name its subject. A red nobody can read is not yet a gate.
- **What the table actually measured.** Measured at HEAD in a clean `git worktree` (detached checkout of `1b2a0e0`, `node_modules` junctioned, `dist/` copied in — the shared working tree was never touched): six rows answer the table exactly (`design-model` 169/169 · `ai-providers` 95/95 · `three-runtime` 635/635 · `world-engine` 109/109 · `agent-runtime` 658/658 · `exec-host` 358/358, files 16/9/30/4/46/14), and the studio row answers **2832/2832 over 142 files** where the table said **2840/2840**. The difference is exactly the eight cases the studio lane's uncommitted `ops.test.ts` (+3) and `trail.test.ts` (+5) carry in the shared tree: v549's `--write` measured the DESKTOP, and the number it committed counts test bytes HEAD does not have. The row was right to refuse — it refused the lie its own prose predicted.
- **The change, in two doors.** (1) `--write` now runs **§1a** before the first suite: `git status --porcelain -- <each of the seven package roots>`, and any path refuses the write BY NAME (thirteen paths in this checkout's studio package today) — a table generated from uncommitted test bytes describes a tree nobody can check out. Check mode is unchanged: it grades the tree in front of it, which is what makes a local red useful before a commit. (2) `causeOf` prints the error line **plus its indented continuation**, stopping at the stack (`at …`), at the first unindented line, or at a blank one, bounded at 24 lines / 2000 bytes; a single-line error prints exactly as before.
- **Regenerated from HEAD, not from a desktop.** The block in `docs/evidence/studio/README.md` is the output of `--write` in the clean worktree — `@nexus/studio` reads **2832/2832**, the other six rows are unchanged, and `--write`'s own self-check (`compare(rewritten, rows) === []`) passed before the block was copied back. The dirty-tree refusal is witnessed, not asserted: `--write` in the shared tree printed the thirteen paths and exited 1 in under a second, before measuring anything.
- **The arms grew by the pair that grades the cause.** R12 plants an assertion whose subject sits on its SECOND line (the exact shape of the package-counts red) and is satisfied only when both findings reach the log; R13 plants an error followed by two stack frames and is satisfied only when the frames do **not** — the rule is a narrowing, not "print more". The runner now matches **42/42** (`verify:arms-freshness` named `runner` the moment `causeOf` moved), and the re-armed receipt is a full **42/42** over **103 derived rows**.
- **Bounds.** The regenerated numbers are Windows counts from this box, and the platform witness is now measured: run `40928766201` (sha `1c21bbd`) reads `verify:package-counts docs/evidence/studio/package-counts-proof.mjs [declared 600000ms] ... OK 69.0s` — ubuntu answered the win32-generated block exactly on all seven rows. Before the run, the scan had found no test in the seven packages branching on `process.platform` for its COUNT (the only conditional is three-runtime's `distSync` skip, which needs a missing `dist/` and CI builds one); the run is the measurement, the scan is only why it was expected. §1a reads tracked changes **plus untracked files** under the package roots; ignored build output (`dist/`, `node_modules/`) does not refuse, which is why the clean worktree could generate the block it did. And a table regenerated at HEAD goes stale the moment another lane commits test cases — that is the row's design: the next build refuses, now names the package, and asks for `--write`.

### v551 — a number should carry the machine that answered it, now that two machines have answered the same numbers: the block stamps its platform, and the hosted verdicts are recorded (ADR 0016 amendment 532)

- **The verdicts, in one green run.** Run `40928766201` (sha `1c21bbd`, 2026-10-29, 14 m 35 s) is GREEN end to end: `verify:service ... [declared 1200000ms] ... OK 8.1s` (the new warm-up step had already run `mvn -B -q -f services/nexus-api/pom.xml test` under Temurin 25.0.5), `verify:package-counts ... [declared 600000ms] ... OK 69.0s` against the win32-generated block, `verify:publish ... [declared 900000ms] ... OK 29.5s` — and the population reads `103/103 green of a derived population of 103 · residue named: 0`. v547's first hosted contact is closed; the table's seven rows agree across win32 and ubuntu; the residue is empty at this ref.
- **Why a stamp.** That agreement is a fact about today's test bytes. The block it verified was generated on Windows, and if a future case ever branches on the platform, the red sentence "the table says N; the suite answered M" cannot tell a regression from a platform difference by itself. The generated footer now names the machine and Node that produced the numbers — `(win32 x64, Node 24.15.0)` — so the next red carries the hypothesis with it instead of asking its reader to guess where N was measured.
- **The change.** `render()` appends the stamp; the block is regenerated by `--write` in the clean worktree (the seven numbers are unchanged; only the footer moved), and `--write`'s self-check still grades every row against the run it just made. No gate reads the footer — the comparison is the rows — so the stamp cannot be a way to smuggle a claim past the checker.
- **Bounds.** The stamp describes where the numbers were GENERATED, not where they are checked: a linux check of a win32 block is the intended shape, and run `40928766201` is exactly that. A genuinely platform-dependent count would still red the row in CI; the stamp only tells the reader where to look first. Being prose inside the block, the stamp is NOT graded — `compare()` reads the seven rows and their order, nothing else — so a hand-edited stamp would survive the gate. That is deliberate: the graded claim is the numbers, and demanding the stamp match the checking machine would make every linux run red. It is a record, not a witness; a reader who needs the witness re-runs the row.

### v553 — the last proof outside the population comes in: the real-browser harness moves into the evidence tree and the build runs it as row 104 (ADR 0016 amendment 534)

- **The question v546 left open.** Its bounds said `verify:publish-e2e` — the real-browser harness that drives the Studio's Publish control through a real PostgreSQL, the real service, the real Studio and a real Chrome — "is NOT wired and stays outside the derived population: it drives a real Chrome through `tools/`, which the admission rule excludes by construction, and wiring it is a separate admission question". This is that question answered, and the answer is that the directory was never the point: the rule admits every `verify:*` script whose whole command is one `node` call into `docs/evidence`, and the harness had lived under `tools/harness/` since v194, before the runner existed. Nothing about the file's subject or prerequisites was ever an exclusion reason — Docker with the pgvector image, JDK 25 + Maven, Chrome and `node_modules` are all already in the workflow for other rows.
- **A move, not a wrapper.** A new evidence proof that spawned the harness and relayed its summary would have put a file between the build and the proof whose verdict is a string about another script's string. The harness moved as it stands (`tools/harness/studio-publish.mjs` → `docs/evidence/m7/studio-publish.mjs`), basename kept, and only the deeper path changed: its two imports (`cdp.mjs`, `leakSweep.mjs` — machinery, not proofs, still under `tools/harness/`), `REPO_ROOT` one level up, and the run line in its header. It declares its own milliseconds, as the row that spends them: `// sweep-budget-ms: 1800000`.
- **The needle that had to follow.** `leak-sweep-proof.mjs` §3 proves the harness calls the sweep before it takes a port by reading its source, and its needle was the literal `from './leakSweep.mjs'` — a specifier the move changes. The needle now names the BINDING (`import { … sweepLeftoverDatabases … } from '…leakSweep.mjs'`), so the clause is about the import and not about where the helper lives; green against the moved file, it reads `imported, called at offset 16424, BEFORE the port is taken (17310) and before the database starts (17387)`.
- **Red, then green, in the gates' own sentences.** With the file moved and the README untouched, `verify:evidence-census` refused with its four drifts — "the README's ROW row says 103 rows; this census derived 104", the same split twice, and "the README says 115 tracked modules; this census read 116 from the index". After the cells moved: `116 tracked modules close as 104 row + 4 helper + 2 swept + 6 tool + 0 deferred · 0 unclassified · rows 104+0 · every row file the commit owns · the README's table and prose restate these numbers and agree`. `verify:ci-wiring` reads `[§5] derived population 104 = runs 104 + named residue 0`, names `verify:publish-e2e=1800000ms` among **10** declaring rows of 104, and the worst case moves 478 → **508 min** under the unchanged 60-minute ceiling.
- **The arms had to follow.** The receipt's `scripts` subject is `package.json`, whose bytes moved when the script's target did; `verify:arms-freshness` refused with the stale population row `verify:publish-e2e docs/evidence/m7/studio-publish.mjs // sweep-budget-ms: 1800000`, and the re-armed receipt is a full **42/42** (25 gate incl. the control, 17 runner), stamping 7 subject hashes and **104 derived rows**; freshness then reads **8/8 fixture arms**.
- **Measured before wiring.** Through the real runner in the clean worktree (`D:/nexus-pkgcounts-wt` at `03279a2` plus this change, `node_modules` junctioned): `verify:publish-e2e docs/evidence/m7/studio-publish.mjs [declared 1800000ms] ... OK 672.6s` — **1/1 green of a derived population of 104 · residue named: 0**. The same bytes read 440/440 twice at v552; this measurement is about the row: the marker is read as declared, the runner finds the file, and the harness's own exit is the verdict.
- **Bounds.** The row's first hosted contact is the next CI run and is not claimed here: it needs a Chrome the candidate list can find (the list ends at `google-chrome`), a Docker daemon holding the pre-pulled `pgvector/pgvector:pg16`, and a JDK 25 + Maven on `PATH`. The row adds ~11-12 minutes to the proofs step here; the previous full job was 13 m 49 s (`40997877121`, sha `03279a2`, 2026-10-30), and the job's 60-minute ceiling is unchanged. A TIMEOUT kill is a SIGKILL, so the harness's `finally` cannot run and its container survives — but leak-sweep's owner-gone rule retires it at the next run's §1a, and that rule is a row of this same build. The two helpers stay under `tools/harness/` because the census claims modules under `docs/evidence`, and machinery is not a proof. The harness starts a DEV server by design (v194: the route reads `NEXUS_API_URL` at request time), so this row grades the source the Studio serves, not the production build `npm run build` produced.

### v554 — the row's first ubuntu contact answered green: `OK 363.1s` inside its 1 800 000 ms declaration, `104/104`, and a job that read 20 m 32 s of the 60-minute ceiling (ADR 0016 amendment 535)

- **The contact v553 deferred.** Run `41000350370` (sha `4ca1280`, 2026-10-30) carried row 104 to ubuntu for the first time. The row answered on the first attempt: `verify:publish-e2e     docs/evidence/m7/studio-publish.mjs [declared 1800000ms] ... OK 363.1s`, and the population line read `104/104 green of a derived population of 104 · residue named: 0`. No repair was needed between the wiring and this contact.
- **The job's shape.** Job 03:59:22Z → 04:19:54Z = **20 m 32 s**; proofs step 04:01:50 → 04:19:49 = **17 m 59 s**. All twelve steps above the proofs were green, so the four prerequisites v553 named were met by the workflow's own steps rather than assumed: the docker pre-pull (pgvector + `node:22-alpine`) took 10 s, the Maven warm-up 16 s, and the harness found its Chrome through the candidate list's PATH fallback.
- **What the row costs.** 363.1 s on the hosted runner against 672.6 s locally (a Windows box also running the arms) — 6 m 3 s of the proofs step, 33.7% of it, and the largest single row in the population (next: `verify:mutation OK 200.8s`, `verify:isolated OK 145.5s`, `verify:package-counts OK 67.6s`). Without it the step would have read ~11 m 56 s, within a minute of v552's 11 m 21 s at 103 rows. It is the first row whose proof starts four long-lived servers to grade one button.
- **The ceiling's first real reading.** 20 m 32 s of 60 minutes is 2.9× headroom — the first measurement of what the population actually costs with a live-stack row inside it, rather than what it may cost. §11's rule (ceiling strictly below the rows' worst-case sum, now ~8.5 h at 104 rows) is unchanged; the ceiling remains the tighter bound.
- **What this green does NOT say.** The runner prints a row's output only when it reddens, so the hosted verdict is exit-based: `OK` means the harness exited 0. The `440/440` count is the local measurement of the same bytes at amendment 533, not a number the hosted log printed. A verbose channel that surfaces a green row's own last line is not claimed here. One green contact is one sample, not a no-flake guarantee, and the 2.9× headroom is a fact about this runner, not a promise about a slower one.
- **The record's own bytes.** Run `41002581846` (sha `9c858a7`, the commit that wrote this section) was green end to end: job 04:23:03Z → 04:43:15Z = 20 m 12 s, `verify:publish-e2e … OK 359.7s`, `104/104 green of a derived population of 104 · residue named: 0`.

### v555 — the last human-run gate is scheduled: the 42 arms become a row, and their one in-tree write stops re-stamping unchanged bytes (ADR 0016 amendment 536)

- **The ROSTER's reason was false, in the way v546 found an exclusion's reason false.** The census declared `ci-wiring-arms.mjs` a TOOL with "deliberately not a verify:* script so the derivation can never schedule a file whose job is to break its own subject". Measured: every arm rewrites a COPY of the gate or the runner inside `../nexus-ci-arms-plane-<pid>`, removed the moment the arm ends — nothing mutated survives. The only file the tool ever wrote inside the repository was the receipt, and v542's receipt re-stamped on every run; a re-stamp of evidence bytes is not a broken subject.
- **What had to change for a schedule to be safe.** The receipt write is now content-driven: the tool rebuilds the receipt and compares it field by field — `tool`, `scope`, `arms`, `matched`, `armNames`, `subjects`, `population` — with the committed one, dropping `ranAt`; identical content leaves the file untouched and prints "already stamps these bytes — left unchanged". A scheduled run therefore cannot rewrite a graded byte, and the row's own run proves it: `arms-receipt.json` hashed the same before and after its 284.7 s.
- **The first refusal the schedule met was a borrowed prerequisite.** The runner derives a row's dist prerequisites from quoted paths in the row's own bytes (an over-approximating safety net, kept as it is), and R7's synthetic stub body carried the literal `./packages/fake/dist/index.js` — so the runner refused to schedule the arms at all: `verify:arms needs packages/fake/dist`. The stub's target is now assembled (`'./${'packages'}/fake/dist/index.js'`): the plane's stub still carries the whole literal, R7 still grades what it graded (42/42 again), and `distNeeded('docs/evidence/ci/ci-wiring-arms.mjs')` now reads `[]`. The row author is the one who must not borrow prerequisites.
- **The wiring.** `verify:arms` → `node docs/evidence/ci/ci-wiring-arms.mjs`, placed after `verify:evidence-census` so `verify:arms-freshness`, which runs earlier, grades the COMMITTED receipt before the arms row can refresh it. The tool declares `// sweep-budget-ms: 900000` in its first column; four runner arms sleep by design, and the row is now the second-largest in the population after the browser harness.
- **Red, then green, in the census's own sentences.** With the script added and the ROSTER entry removed but the README untouched, the census refused four drifts verbatim: "the README's ROW row says 104 rows; this census derived 105" · "the README's ROW row says 104 run + 0 excluded; this census derived 105 run + 0 excluded" · "the README says 6 TOOL module(s); this census derived 5" · "the README's "at this ref" sentence says 104 running + 0 excluded; this census derived 105 + 0". Now it reads `116 tracked modules close as 105 row + 4 helper + 2 swept + 5 tool + 0 deferred · 0 unclassified · rows 105+0`. The wiring gate reads `[§5] derived population 105 = runs 105 + named residue 0` · `[§9] 11 row(s) of 105 declare their own: … verify:arms=900000ms …` · `[§11] job ceiling 60 min is BELOW the rows' own worst case 523 min (105 rows)`, and freshness stays 8/8.
- **The measurement.** Through the real runner: `verify:arms     docs/evidence/ci/ci-wiring-arms.mjs [declared 900000ms] ... OK 284.7s`, `2/2 green of a derived population of 105 · residue named: 0` (the second row is `verify:arms-freshness`, selected by the same `--only arms`). Standalone on this box the tool read 438 s at v553's bytes under load and ~5.5 min again after the R7 change. The column's first hosted contact is the next CI run and is not claimed here.
- **Bounds.** The row adds roughly 5-8 minutes to a proofs step that read 17 m 59 s at v554; the job read 20 m 12 s of its 60-minute ceiling at v554, so the headroom goes from 2.9× to about 2.3×. The row's green is exit-based — the runner prints a row's output only when it reddens. R2 and R2c kill a 1.5 s stub at a 600 ms budget; on a starved runner that margin is the likeliest flake, and the first hosted contact is where it will say so. `verify:arms-freshness` remains the fast check for partial runs and the receipt a human artifact in the common case, because a run over unchanged bytes does not rewrite it.


### v563 — a green row now speaks one line: the last stdout line under every OK, two arms that grade the green channel, and row 105's first ubuntu verdict carried (ADR 0016 amendment 538)

- **The hole, named by v554.** "The runner prints a row's output only when it reddens, so the hosted verdict is exit-based: `OK` means the harness exited 0." A row that exited 0 having graded nothing read exactly like one that asserted `440/440`; the hosted log could not tell them apart.
- **What changed.** Under each OK line the runner prints `      | ` followed by the row's last non-blank STDOUT line, trimmed and bounded to 300 bytes. A red row still prints `causeOf` alone (v550), and a kill has no last word. The stream is stdout, kept separately from stderr — measured before shipping: the combined tail ended in remix's `(Use node --trace-warnings ...)` warning, not its `ALL SECTIONS PASSED`.
- **Measured on this box.** `--only remix` printed `      | [remix-proof] ALL SECTIONS PASSED`; `--only leak-sweep` printed `      | [leak-sweep-proof] ALL SECTIONS PASSED (the rule is a pure function of the listing, the proof calls it before it takes a port, and a failed listing is a courtesy, not a gate)`; the freshness row prints `      | 8/8 fixture arms matched`, and the arms row's own gutter line is its receipt line (`receipt: docs/evidence/ci/arms-receipt.json already stamps these bytes (44 arm(s), 7 subject hash(es), 105 derived row(s)) — left unchanged` at the measured 105-row tree).
- **Two arms grade the channel.** R14 — a green stub prints two lines and exits 0; the last must appear under the verdict, the first must not. R15 — a stub prints to stdout, then fails on stderr; the RED banner and the cause must appear, the stdout line must not. The set is now 44 arms (25 gate incl. the control, 19 runner), and `arms-receipt.json` stamps 44 arms / 7 subjects / 106 derived rows.
- **Row 105's first ubuntu contact, carried.** Run `41005413779` (sha `ca7d71a`, 2026-10-30): job 04:53:58Z → 05:14:34Z = **20 m 36 s**, proofs step 04:56:12 → 05:14:33 = **18 m 20 s**, `verify:arms     docs/evidence/ci/ci-wiring-arms.mjs [declared 900000ms] ... OK 142.5s`, `105/105 green of a derived population of 105 · residue named: 0`. The row cost the hosted step 142.5 s (local: 284.7 s); the step's 18 m 20 s also carries `verify:publish-e2e OK 349.5s`. No repair was needed between the wiring and the contact, and R2/R2c's 600 ms margins did not flake.
- **What this green does not say.** The gutter prints the row's own sentence, not its checks: a proof that prints a number without asserting it still lies. It is one line per row, at most 300 bytes; a row whose verdict lives on stderr gains nothing; `verify:arms-freshness` remains the fast check for partial runs, and no row's budget or verdict changed. The hosted log's gutter lines are the first reading of what each row says about itself.
- **A moving ref, said out loud.** This increment was drafted at `ca7d71a` (105 rows); by the time it landed, another lane had claimed amendment 537 for v556 and the webhook lane had added `verify:webhooks`, moving the census to 117 tracked / 106 rows and the ledger to amendment 537. The row was measured before that row existed (`OK 385.5s`, population 105 at its start), the receipt was then re-stamped at 106 rows by a fresh full arm run over the bytes this commit ships, and the freshness row now compares 106.
- **First hosted contact of the gutter.** Run `41102039245` (sha `9925537`, 2026-10-30) printed **105 gutters under 106 rows**: every green row spoke one line (e.g. `| [remix-proof] ALL SECTIONS PASSED`, `| 8/8 fixture arms matched`, the arms receipt line, the census line, the wiring line), and the one red row (`verify:package-counts`, the inherited studio-row drift repaired at v564 / amendment 539) printed its verdict and cause alone — the v550 channel working. One gutter is a lone `| }` (`verify:pipeline` ends its stdout on JSON's closing brace): honest, and the reason a row that wants a quotable gutter must end by saying something.

### v565 — the gutter's bound is 300 BYTES, not 300 UTF-16 units: the clip walks code points, and R16 prints 80 four-byte characters and requires exactly 75 (ADR 0016 amendment 540)

- **The defect in the bound v563 shipped.** v563's sentence said "bounded to 300 bytes" while `lastLineOf` was `.slice(0, 300)`, which counts UTF-16 code units: 300 units of four-byte characters is 1200 UTF-8 bytes, and a slice at unit 300 can cut a surrogate pair in half. No row on this box prints such a line, which is exactly why the bound was never measured.
- **What changed.** The clip walks code points and stops before the prefix would exceed 300 bytes (`Buffer.byteLength`), so the sentence is now the code and a character is never cut. ASCII rows are unaffected (300 bytes = 300 ASCII characters); a row full of `·` (2 bytes) keeps 150; a four-byte row keeps 75.
- **R16 grades it.** The stub's last line is 80 × `U+1F642` (320 bytes); the gutter must carry exactly 75 as whole characters and no replacement character — a 76th would be 304 bytes, and a split pair would break the 75-character match. The set is now **45 arms** (25 gate incl. the control, 20 runner), and `arms-receipt.json` re-stamps 45 arms / 7 subjects / 106 rows; `verify:arms-freshness` still matches its 8 fixtures.
- **What this does not say.** The bound is about log size, not meaning: a 300-byte gutter can still be housekeeping (`| [cleanup] throwaway repos removed`) or a lone `| }` (`verify:pipeline`'s JSON close). v563's rule stands — the runner prints what the row said, and a row that wants a quotable gutter must end by saying something.

### v566 — every green row contributes a gutter, silence is named `(the row printed nothing)`, and pipeline-proof ends on its verdict instead of a lone `}` (ADR 0016 amendment 541)

- **The defect.** The gutter printed only when the row had a last line (`if (line) console.log`), so a green row that printed nothing produced no gutter and the OK and gutter counts could differ with no sentence saying why. On the one all-green run so far (`41107874805`, sha `004316d`, 2026-10-30, 106 rows) every row happened to print, so this half was structural — the mechanism permitted an uncountable green row. The observed half was `verify:pipeline`'s lone `| }`: a truthful gutter that described nothing.
- **What changed.** One gutter under every OK, unconditionally; empty stdout and empty stderr say `(the row printed nothing)`. `pipeline-proof.mjs` now prints its verdict sentence after the JSON and after every assertion, so its gutter reads `[pipeline-proof] ALL SECTIONS PASSED (prompt -> editable ops, real layout, AI diff, undo/redo, deterministic edit, multi-page, persistence, instance projection; demo mode, $0)`.
- **R17 grades it.** A stub that writes only its `ran.log` and exits 0 with no output must show its OK and exactly `      | (the row printed nothing)`. The set is now **46 arms** (25 gate incl. the control, 21 runner); `arms-receipt.json` re-stamps 46 arms / 7 subjects / 106 rows, and `verify:arms-freshness` still matches its 8 fixtures.
- **A count corrected.** Re-reading `41107874805` with the same extraction found **seven** over-bound gutters — 305, 303, 303, 302, 302, 302 and 301 bytes (`isolated`, `table-recount`, `provenance`, `asks-axis`, `confession`, `timeout-axis`, `drive-axis`) — not the five amendment 540 stated; addendum 540 carries the correction and the reader that produced it.
- **Amendment 540's hosted contact, read before this cycle wrote its own bytes.** Run `41123935905` (sha `be9d655`, 2026-10-30; job 20:31:51Z → 20:54:59Z ≈ 23 m 8 s) read `106/106 green of a derived population of 106 · residue named: 0`, and the same reader that found the seven over-bound gutters finds **106 gutters, none over 300 bytes** — the byte-true bound holding on hosted bytes (`verify:arms … OK 151.5s` with its 45-arm receipt gutter, `verify:package-counts … OK 66.7s`, `verify:webhooks … OK 27.1s`). `verify:pipeline`'s gutter in that run is still the lone `| }` this cycle closes at the row.
- **What this does not say.** Naming silence is not meaning, and a housekeeping last line (eight `[cleanup] …` gutters on both the `004316d` and `be9d655` runs) still describes housekeeping. The next gap is each row's self-description.

### v567 — a scratch plane that links into the graded tree is named before it is deleted: `tools/ci/tree-guard.mjs`, its row with nine fixture arms, and `git worktree remove --force` re-measured on every build (ADR 0016 amendment 542)

- **The loss this directory was not built to see.** On 2026-11-02 a `git worktree remove --force` aimed at a scratch worktree deleted 522 tracked files out of the checkout, because that worktree's `node_modules` was a junction pointing back INTO it — the shape npm writes when a plane reuses the tree's dependencies. Later the same afternoon, unlinking seven `@nexus/*` links "inside" a stale plane removed the MAIN tree's workspace links, because the path listed was reached THROUGH the plane's own `node_modules` junction: listing through a link is listing the tree. HEAD's bytes came back with `git checkout`; the concurrent lane's uncommitted edits did not, and the seven links were re-created by hand (`fs.symlinkSync(<package dir>, <link>, 'junction')`) with every gate re-run afterwards.
- **Measured, not remembered** (git 2.52.0.windows.1, Node 24.18, MSYS coreutils 8.32, throwaway repo, worktree holding `node_modules/pkg → <outside>`): `git worktree remove --force` → plane removed AND target emptied (3 → 0 files); `git worktree remove` → refuses while untracked files exist; `fs.rmSync(dir,{recursive:true,force:true})` → link removed, target intact; `rm -rf` (MSYS) and `rmdir /S /Q` → link removed, target intact; a real symlink (not a junction) → survives even `--force`. One instrument holds the safety, a different one holds the hazard.
- **The guard** (`tools/ci/tree-guard.mjs`) walks a directory without descending through a link, classifies each reparse point against the named root, exempts a directory that IS inside the tree (this checkout's own workspace links are the reason), and prints a refusal that names the links, their targets, the remedy (`fs.rmdirSync` on the link, then delete the directory) and the order — outermost first, because a link below a link is reached only by walking the target. CLI: `node tools/ci/tree-guard.mjs --check <dir> [--root <repo>]` · `--worktrees`, exit 0/1/2.
- **The row** is `verify:tree-guard` → `docs/evidence/ci/tree-guard-proof.mjs`, six clauses, **nine fixture arms**, each aiming at a CLAUSE rather than at the guard: T1 a directory where a link should be (§1), T2 a third link (§1), T3 the hazard landing outside (§2), T4 the exemption with nothing to exempt (§3), T5 the link-free plane dirtied (§4), T6 a deleter that follows (§5), T7 a forged worktree list carrying the hazard (§6); T0 and T8 pass, and T8 — a link one directory deeper — must witness its passage in the printed lines (`refused 1 link(s) into the tree`, `exits 1 on the hazard plane and 0 on the clean one`).
- **§7 is live and refuses only what this checkout owns.** The registered worktrees are scanned and PRINTED (2 outside it here, 2520 entries read, 0 links) rather than refused — a build row that reddened master over a neighbour's scratch plane would name deleting work this lane does not own — while the workspace census IS a door: all 7 `node_modules/@nexus/*` links must exist as reparse points resolving inside the tree. That is the exact set the first command destroyed, and its absence reddens the next build.
- **§8 re-runs the named command.** A temp repo, a worktree holding one junction (win32) or symlink (POSIX) into that repo, then `git worktree remove --force`: on this box the target goes 1 → 0 file(s), which is what the refusal text claims, and the row asserts the per-platform outcome instead of trusting a log line from a day it happened. First hosted contact will be the POSIX half's first reading.
- **The derived numbers moved with it.** `verify:ci-wiring` reads 107 rows = 107 run + 0 excluded and **14** rows of 107 declaring their own budget (the new row names `// sweep-budget-ms: 120000`, measured 10.5 s on this box); `verify:evidence-census` closes **118** tracked modules as 107 row + 4 helper + 2 swept + 5 tool + 0 deferred; the arm set stays **46** (no gate or runner behaviour changed) and `arms-receipt.json` re-stamps against the new manifest and population. _Corrected at v568: §9 measures **13** declaring rows at `3af6128` and here — the 14 was carried forward from v566's prose, not measured._
- **v566's hosted verdict, read while this was being written.** Run `41421600776` (sha `ba346a4`, 2026-11-02; job 09:33:15Z → 09:56:56Z ≈ 23 m 41 s) reads `106/106 green of a derived population of 106`, **106 OK lines and 106 gutters**, 0 over the 300-byte bound, 8 housekeeping `[cleanup]` — and `verify:pipeline`'s gutter is the 175-byte `ALL SECTIONS PASSED` sentence rather than `| }`. The row's own first hosted contact (row 107, and the POSIX half of §8) is still ahead of it.
- **What this does not say.** Nothing here intercepts the command — a guard a person must remember to run is not a door, and the standing rule stays the narrow one: no scratch plane that reuses this checkout's `node_modules`. What the row does own is proving the instrument names the hazard (§1–§6), proving the teardown this repository uses does not follow links (§5), and refusing the damage after it lands (§7).

### v568 — a green row's last line is what it graded, not what it deleted: the eight `[cleanup]` tails the hosted log named move above their row's summary, and gate clause §12 refuses the shape (ADR 0016 amendment 543)

- **The eight, named by a run rather than by a scan.** `41421600776` (sha `ba346a4`, 2026-11-02; amendment 542's reading) carried 106 gutters and eight of them said `[cleanup] …`: `verify:color`, `verify:commit-echo`, `verify:door-kill`, `verify:log-window`, `verify:reaper-survivor`, `verify:record-window`, `verify:report-kill`, `verify:report-window`. Every one of those rows measured something; the build kept the sentence about deleting a temp directory. v566's own closing line had named exactly this as "the next gap, unmoved".
- **What moved.** In each row the `console.log('[cleanup] …')` statement now sits ABOVE the row's `[summary]` print, so the summary is the last statement executed — the edit `pipeline-proof.mjs` got at v566. Re-run: 8/8 exit 0 (2 s–19 s), each ending on its measurement (`[summary] faces measured: 5 · door reads: 9 over 5 distinct doors …`). A rescan over the derived set finds **0** rows whose last source print opens on a housekeeping tag, which is why the eight are the whole set and not a sample.
- **The door is §12.** For every running row the gate reads the last `console.log(` that is not commented out and refuses one whose literal opens `[cleanup]`/`[teardown]`/`[finally]`/`[housekeeping]` (leading whitespace and `\n`/`\t` escapes stripped first). It prints `106 of 107 … none of them a housekeeping tail · 1 row(s) end on a call whose argument is not an opening literal · 0 rows print no console.log at all`; the unreadable one is `verify:audit-contract`, whose tail is a multi-line `console.log(` — named, and not edited here, because that file is the audit lane's.
- **Stated as a proxy.** A row's executed last line is knowable only from the run (prints can sit in branches), so the clause keys on the TAG rather than the subject, walks only the running set (a helper ending on cleanup is nobody's business), and quotes file + line in the refusal. The first readable call from the end is the tail whether or not it can be read: walking further up would grade a line that is not last.
- **Arms: A25 reddens, C1 and C2 refuse to.** A25 appends a `[cleanup]` print to a running row and must redden at §12 carrying its words; C1 appends a `[measured]` print to the same row and must stay green (the clause does not cry wolf at every tail); C2 appends the cleanup print to `agents/sweep.mjs`, a HELPER the gate imports, and must stay green (the scope is the running set). `gatePlane` gained an `append` edit because a tail has no needle — both non-row closure files end on `}` and `}\n` occurs 142 times in the sweep, so the exactly-once guard would refuse an arm that cannot name its brace. Two load-time asserts keep the carriers' class live. The set is now **49 arms** (28 gate incl. three controls, 21 runner) and the receipt re-stamps 49 / 7 subjects / 107 rows.
- **A number corrected.** Amendment 542 said **14** rows declare their own budget; §9 measures **13** at `3af6128` and here, by two readers. The count is derived, the prose was not.
- **v567's hosted verdict, read while this was being written.** Run `41428780884` (sha `3af6128`, 2026-11-02; job 10:26:11Z → 10:45:33Z ≈ **19 m 22 s**, proofs step ≈ 16 m 50 s) reads `107/107 green of a derived population of 107 · residue named: 0` — **107 OK lines, 107 gutters, 0 over the 300-byte bound, 0 RED**. `verify:tree-guard` is there at `OK 0.4s` under `9/9 fixture arms matched`, and its §8 ran on Linux rather than skipping: the clause measures on every platform and asserts that platform's own outcome, so a symlink that WAS followed would have reddened the row — the POSIX half of the v567 claim now has a hosted reading. The eight `[cleanup]` gutters this cycle moves are all still in that log (`verify:arms … OK 122.0s`, `verify:ci-wiring … OK 12.6s`, `verify:evidence-census … OK 0.2s`, `verify:table-recount … OK 13.8s`).
- **What this does not say.** Moving a print does not make a row self-describing: `[summary]` is a label, and a last line can state a number no assertion made (§60's older bound). Two rows end on `ALL SECTIONS PASSED`, two on a bare `${matched}/${ALL}` interpolation, and §12 admits both because it keys on tags, not on quality. The executed tail still differs from the source tail wherever a print is conditional — which is why the eight came from the hosted log first.


### v591 — a cut is NAMED: the runner's gutter reserves the room for its own marker INSIDE the 300-byte bound, and gate clause §13 refuses a row whose final print literal is too long to print whole (ADR 0016 amendment 545)

- **The defect the hosted log named, not a hypothesis.** Run `41433663171` (sha `e97cc05`, 2026-11-02, 107 rows) carried **11 gutters of exactly 300 bytes**: severed mid-word with no mark, indistinguishable in the log from a row that had ended its sentence. Four of the eleven were rows v568 had just reordered — the repair that made a row end on its summary is what made the summary's LENGTH the problem.
- **The repair, one arithmetic decision.** The gutter stays **300 UTF-8 bytes** (amendment 540's bound is log size, not character count), but the clip reserves the marker's bytes INSIDE that bound: ` [cut: <n>B]`. A 400-byte line is cut at 288 bytes and carries ` [cut: 400B]` — exactly 300 bytes; a line of exactly 300 bytes prints unmarked (the boundary that keeps the marker from becoming a stamp). The clip still walks code points (amendment 540), so no surrogate pair is split.
- **§13 is sized, not tagged.** For every row of the derived running set the gate reads the LAST `console.log(` that is not commented out and refuses a final literal whose bytes exceed the gutter's room. At this ref it prints `112 row(s) measured against the runner's own 300-byte clip · 0 guaranteed to be cut · 0 land exactly on the bound · the longest whole one is verify:record-window at 293 bytes · 1 row(s) end on a call this gate cannot read`. The one unreadable tail is unchanged from v568: `verify:audit-contract`'s multi-line `console.log(`, named and NOT edited — that file belongs to the audit lane.
- **Five arms, and the stale hardcode they retired.** `A26` plants a 320-z final print in a row and must redden at exactly §13; `C3` plants it in a helper and stays green (scope is the running set); `C4` plants a line long only at interpolation time — unrefused by construction, because the clause refuses what it can measure; `R18` demands 400 ASCII → `| ` + 288 `a`s + ` [cut: 400B]`; `R19` is the boundary witness — `'b'.repeat(300)` prints whole, unmarked. `R14` gains `lacks: /\[cut: /`; `R16` re-derives to **72 code points + ` [cut: 320B]`**. The gate set moves **49 → 54 (31 gate incl. one control, 23 runner)** and the receipt re-stamps **54 arms / 7 subjects / 113 derived rows**. **A18 now derives its escalation from the population itself** (`CEILING_ABOVE = ceil(WORST_ROW_MS / 60000) + 1`, asserted `> 60`): the hardcoded 600 no longer exceeded the rows' own 630-minute sum, so the arm had silently stopped arming §11 — found only because the set is re-run on every build.
- **Instrument readings at this ref (2026-11-03, this box).** `verify:ci-wiring` **exit 0** (trigger covers master, proof step #11, nothing swallowed, population **113 closes as 113 + 0**, read-only token, the §13 line above, 0 rows ending on a cleanup print); `verify:arms` **54/54 matched** (all planes removed); `verify:arms-freshness` **8/8**, receipt from a full 54-arm run; `mvn -B test` **751 tests, 0 failures, 0 errors, 0 skipped**. `verify:evidence-census` passes at this ref because the traffic row (`docs/evidence/m9/service-traffic-proof.mjs`, landing in this same ref) is tracked here; with it untracked the census refuses, which is the census catching a README that outruns its commit.
- **No hosted contact yet, stated plainly.** The motivating log `41433663171` predates these bytes; the marker's behavior on real severed hosted gutters is known only from the fixture arms until the next hosted run. This section does not claim a hosted reading for its own repair.
- **Bounds (§60), stated.** §13 reads SOURCE, not run bytes — an interpolated tail is invisible to it by construction (C4, and the printed `1 row(s) end on a call this gate cannot read`). The marker names a cut, not a verdict: a severed sentence and a brief one are the same bytes to the log; it is this slice's 12-byte choice, not a format version. §13 keys on the LENGTH of the final literal's opening bytes, not its words, and enforces nothing a row is allowed to say. The 112 measured rows are tails the gate can read, and say nothing about what those rows printed.

### v645 — a row arrives whose hazard is the WORKFLOW's, not the machine's: the Spring Cloud proof is EXCLUDED by name, and the arms that plant an exclusion now READ the shipped declaration instead of assuming it was empty (ADR 0016 amendment 572)

- **What landed, read out of the workflow's bytes.** `package.json:41` carries `"verify:spring-cloud": "node docs/evidence/java/spring-cloud-proof.mjs"`, so the admission rule turns it into a row and `§5` counts it: **117 = 116 run + 1 named residue**. The proof's own roster (`spring-cloud-proof.mjs:95-98`) names four modules and `:369` runs `mvn -o -B package -DskipTests` in a copy of each. Against that, `.github/workflows/ci.yml` brings up **no** PostgreSQL — its docker step is two `docker pull` lines, and the job declares no `services:` block — and it warms Maven with `mvn -B -q -f services/nexus-api/pom.xml test` plus a `cache-dependency-path` naming that one pom. So on the hosted runner the row would fail on an artifact `-o` refused to download and on a container (`nexus-postgres`, `infra/docker-compose.yml`, `--profile core`) that was never created. The red would have named the runner, not the topology.
- **The honest half of that sentence is the exclusion, not a skip.** `tools/ci/proof-set.mjs` now carries one `EXCLUDED` entry naming the file and its needs — *"the repository's own running PostgreSQL container, and an offline-warm Maven for the three service modules the workflow never builds"* — and §6 grades the reason against the file: `[§6] residue docs/evidence/java/spring-cloud-proof.mjs reaches "postgres" in code — …`, i.e. the reach is in the proof's CODE (`createConnection` to a published port, `docker exec … psql`), not in its prose. The row is excluded from the BUILD, not retired: it is the java lane's own evidence, and commit `04693aa` records the four-service topology it proves on a machine that has the container. **Retirement is a ci.yml change** (a compose-up step and a per-module warm), and the census's derived run/residue split moves the day it happens — that is why the need is written as the workflow's absence rather than as slowness.
- **The premise the arms carried died with it.** v547 retired the last excluded row, so A10/A11 spliced their planted entry onto a needle copied from `export const EXCLUDED = [];` — true then, false now, and a needle that matches nothing crashes the arm instead of arming it. Both arms now insert after the opening bracket of a declaration READ from the producer's bytes through `EXCLUDED_DECL_RE`, which accepts the one-line and the block spelling alike; a load-time assert refuses to run when that declaration appears zero or two or more times, because a plant that matched no place grades pristine bytes and calls the result a surviving guard. The planted entry is followed by a comma on purpose: measured in this batch, an entry spliced without a separator makes the plane's producer fail to PARSE, and a gate that dies before reading the residue reports a MISMATCH for a syntax error rather than for its clause.
- **The runner half's plane must not inherit the shipped record.** `runnerPlane` now clears the residue (`residueCleared`) before it writes its nine stub scripts: with the Spring Cloud entry left standing, `unknownExclusions` fires in EVERY runner arm for naming a file the synthetic population cannot hold — R6's charge and nobody else's — and R4's `runs 9 + excluded 0` is the same claim from the other side. The clearing asserts its own carrier too, so the day the producer's spelling moves the arms say so rather than mis-grade.
- **Three arms answered red, and the reading that said why.** The first battery of this batch printed **51/54**: A10 and A11 died at `proof-set.mjs:107` inside their own plane and A15 on an ENOENT. Re-producing those three subjects on the current bytes in a scratch plane answered `declaration hits: 1`, `node --check` exit **0**, and the gate exit **1** carrying A10's predicted sentence — *"nothing OUTSIDE its comments reaches a docker daemon, a maven/postgres client, a harness or a socket — so this exclusion retires a proof the build COULD run"*. So the red was the killed earlier run's residue on a reused plane root, not a live defect; the re-run with nothing else touching the closure answered **54/54**.
- **Instrument readings at this ref (2026-11-10, this box).** `verify:ci-wiring` **exit 0** — trigger covers master, proof step #11 of 12 steps, nothing swallowed, population **117 closes as 116 + 1**, §9 **22 of 116** rows declare their own budget, §11 job ceiling 60 min below the rows' own worst case **667 min**, §12 **115 of 116** end on a literal print with 1 unreadable tail and 0 housekeeping, §13 longest whole tail `verify:record-window` at **293 bytes** and 0 guaranteed cuts. `verify:arms` **54/54 matched** (31 gate incl. the control, 23 runner), planes removed. `verify:arms-freshness` **8/8**, and `arms-receipt.json` stamps **54 arms / 7 subjects / 117 derived rows**. `verify:evidence-census` closes **129** tracked modules as **117 row + 4 helper + 3 swept + 5 tool + 0 deferred**, `rows 116+1`, its own arms **131/131**.
- **Two stale sentences the same change made worse.** The header's `npm run verify:arms # the 49 witness arms` restated a set that moved 49 → 54 at v591, and the §-table stopped at clause 11 while the gate prints thirteen. Both now read 54 and 1–13. A number in prose has no reader unless a gate imports it — these two had none, which is exactly how they survived a cycle.
- **Hosted contact, read 2026-11-10 (corrected by the next section, which is what it was waiting for).** Run `42665488779` (sha `be111c6`, these bytes) printed `113/116 green of a derived population of 117 · residue named: 1` and the `EXCLUDED verify:spring-cloud … — the repository's own running PostgreSQL container, and an offline-warm Maven for the three service modules the workflow never` line verbatim; the parent's run `42585034727` (sha `6e76510`, before the entry) printed `113/116 green of a derived population of 116 · residue named: 0`. The three reds are the SAME rows in both — `verify:health`, `verify:liveness`, `verify:budgets` — so the exclusion added no hosted red, and the residue the build derives locally is the residue the runner reports.

### v646 — the repository has TWO workflow files, and every clause above had read only one: §14 charges a typecheck leg no workflow reaches, and the hosted log proved that the sentence amendment 572 shipped about exactly this reach was false (ADR 0016 amendment 573)

- **The second door, and how long it went unread.** `.github/workflows/main-line.yml` entered the tree at `cf1537e` on 2026-11-09 and pushes to the same `master`. Until this clause, `git grep -l main-line -- tools docs/evidence` answered NOTHING in this directory — the thirteen clauses above read `ci.yml` only, and `ci.yml`'s step census is a counted, evidence-bearing contract (§2 names step #11, §4 its order, §11 the ceiling and token), so the main line's own job sat outside every reach claim this gate makes. Eight of the tree's typecheck surfaces are typed by that job and by nothing else.
- **What the wrong sentence was, read out of the hosted log.** Amendment 572's Execution bullet explained a live typecheck red by saying CI *"never runs `typecheck:main`, so the one tsc invocation that reads `tsconfig.tools.json` … is graded by nothing"*. Hosted run `42665488782` (sha `be111c6`, the same commit that shipped that bullet) has a step named `Typecheck main line` whose command line prints all nine legs, `… && tsc -p e2e/tsconfig.json --noEmit && tsc -p tsconfig.tools.json --noEmit`, and its only error is `evals/suites/demo-mode.mts(3,26): error TS2724: '"../../packages/schemas/src/index.js"' has no exported member named 'DesignDocument'. Did you mean 'ApiDesignDocument'?` — exit 2, 1 m 36 s. The consequence was real (this gate graded none of it); the premise was false (a workflow did run it, and had been running it for 48 commits). The red's own arrival is dated: run `42585034749` at the parent `6e76510` ran that identical chain green and moved on to `npm run evals`, and `64d462d` — the twelfth eval suite, which wrote the bad import — is 1 h 49 m later than that green ref (16:18 → 18:07 local, 2026-11-09) and the next main-line run GitHub logged is `be111c6`'s, 16 commits after it. So `be111c6` was the FIRST hosted contact with those bytes, and the only new hosted red it carried was this one error.
- **The repair is the import, not the gate.** `evals/suites/demo-mode.mts:1` now reads `import { createDocument, createPage, type DesignDocument } from '../../packages/creative-model/src/index.ts';` — the type is declared at `packages/creative-model/src/types.ts:587` and reaches the index through its first line, `export * from "./types"` — while line 3 keeps `AiRequest` in `packages/schemas`, where it is a cross-boundary wire type and belongs. Three lines, no behaviour moved; `npm run typecheck:main` exits 0 at this ref, which is the reading that closes the hosted red. Line 2 also loses `mockProvider` — a name the suite never reads, which `npx eslint evals` flags and which the tree's OWN lint surface cannot: `npm run eslint` (`eslint .`, ESLint 10.11) dies inside `@rushstack/eslint-patch` while reading `apps/studio/node_modules/eslint-config-next/index.js`, exit 2 before a single file is graded, and no workflow step names it, so nothing has ever read that verdict. The dead import is removed here because it is the same file's arrival that broke `typecheck:main`; the unlinted surface and the crashed script are their own increment.
- **§14 counts a REACH, and says so clause-by-clause.** A LEG is `tsc -p <config>` inside a script of the root manifest or of a manifest a root `workspaces` glob names, or a bare `tsc --noEmit` reading its own directory; a leg is REACHED when a step's `run:` body names the declaring script, transitively through `npm run` and `turbo run`. Two refusals follow — an ORPHAN leg (declared, reached by nobody) and an UNTYPED surface (a package `tsconfig*.json` that names no leg and extends nothing) — and the second exists because the first is satisfiable by deleting the thing it counts. At this ref it prints `22 config(s) carry a declared tsc leg across 15 of the 20 directories the root workspaces globs name, and ALL of them are reached by a step of the 2 workflow file(s) · who reaches them: 1 by ci.yml+main-line.yml · 13 by ci.yml · 8 by main-line.yml · 22 tsconfig inside the package set, 7 of them an extends-base excused from a leg · 0 orphaned leg · 0 untyped surface`. Those eight are the whole reason the clause exists: they are typed by one step of a file no other clause reads.
- **The first version of the clause read FILES, and the arm caught it.** `main-line.yml` names `npm run typecheck:main` twice in its own header comment. The first census scanned whole files for `npm run`, so A27 deleted the step and the gate stayed GREEN — a clause that grades prose instead of behaviour. It now walks `stepsOf()` and looks only at `run:` bodies; the same arm went red with the eight orphans named by config and by the script that declares each.
- **Three arms and a closure that had to grow the same way the census does.** `A27` deletes the main line's typecheck step and must redden at §14 with `typecheck leg(s) are declared in a script no workflow step reaches`; `A28` undeclares the leg instead (`tsconfig.tools.json` left with no `tsc -p` anywhere), so the SECOND refusal fires and neither arm can be satisfied by removing a count; `C6` rewrites that same step as a `run: |` block scalar and must stay green, because the clause reads bodies, not spellings. The gate set moves **54 → 57 (34 gate incl. the control, 23 runner)**. `GATE_CLOSURE` is derived, not listed: every file under `.github/workflows` plus every `package.json` / `tsconfig*.json` in the directories the root globs name — a hand-kept closure would grade pristine bytes for the very file an arm just edited and call the result a surviving guard. `arms-receipt.mjs` gains `mainline` among its subjects (7 → 8 hashes), because a receipt that does not hash the workflow whose step the arms delete cannot tell a stale stamp from a fresh one.
- **Instrument readings at this ref (2026-11-10, this box).** `verify:ci-wiring` **exit 0** — all fourteen clauses, population **117 closes as 116 + 1**, §9 **22 of 116** rows declare their own budget, §11 ceiling 60 min below the rows' own **667 min**, §12 **115 of 116** end on a literal print, §13's longest whole tail is now **`verify:ci-wiring` at 293 bytes** (this gate's own closing print grew into the top slot and §13 refused it down to fit the runner's 300-byte clip before it was shipped), §14 as printed above. `verify:arms` **57/57 matched**, planes removed; `verify:arms-freshness` **9/9 fixture arms** (the bullet above); `arms-receipt.json` re-stamped by that run at **57 arms / 8 subjects / 117 derived rows**. `verify:evidence-census` closes **129** tracked modules as **117 row + 4 helper + 3 swept + 5 tool + 0 deferred · rows 116+1 · 0 unclassified**, its own arms **131/131**; `verify:table-recount` **exit 0** with grant **573** titled by this section's heading; `verify:record-encoding` **exit 0**; `npm run typecheck:main` **exit 0**; `npm run evals` **exit 0** with the `demo-mode` suite at **14/14**, which is the reading that says the two-line import moved no behaviour.

- **The eighth hash broke the row that reads it, and the break is the finding.** `verify:arms-freshness` builds its synthetic planes from a hand-written `BASE_FILES` table, and `makeReceipt` asks that plane for EVERY subject in `SUBJECT_FILES`; the moment `mainline` joined the list the fixture had no `.github/workflows/main-line.yml`, so the row died on a raw `ENOENT` inside `arms-receipt.mjs:42` — before §1, before any clause, with nothing for the frontier rule to read. A subject list is a claim about bytes, and each plane that must satisfy it is a second copy of that claim; the receipt's own rule, seen from the side that has to hold it. The crash also exposed something the fixture arms had never graded: `F1` moves the FIRST subject, so no arm had ever hashed the second workflow file. `F8-mainline-moved` does — it rewrites the fixture's main-line job and demands §2 refuse while naming `mainline` — because a subject added to a table that a loop over that table never reaches is a subject nobody hashes. The freshness set moves **8 → 9 fixture arms**, all matched.

- **Bounds (§60), stated.** §14 grades a REACH, not a RESULT: it says a workflow step names a script that names a `tsc -p`, and says nothing about whether that tsc exits 0 — the hosted log above is what reads the verdict. It counts only legs declared in a MANIFEST script, so a `tsc` spawned from inside a proof file is invisible to it by construction, and the `extends`-base excuse is a naming rule, not a coverage claim: a base with no `extends` reader and no leg is a §14 red, which is what A28 proves. Nothing here makes GitHub execute the main-line job; the four readings above come from `gh run view`, and the next one will disagree with this page if this page is wrong.

### v647 — the build's one lint door graded ONE package, and the root script that could have graded the rest died before it named a file: `tools/ci/lint-tree.mjs` walks 19 derived areas against a per-(rule, file) debt ledger on the INDEX's bytes, and the census learned that a door must be attributed to the step that walks it (ADR 0016 amendment 574)

- **What CI linted before this, counted from the manifests.** `npm run lint` is `turbo run lint`, and a package
  joins that run only by declaring a `lint` script. Of the 14 workspace manifests the root `workspaces` globs
  resolve, exactly one declares it — `apps/studio -> eslint . --max-warnings=0`. So the build's lint verdict was
  300 files of one Next app, and said nothing whatever about the other **1117 tracked lintable files** the new
  gate enumerates over 19 derived areas — the ten largest: `apps/web` 548, `docs` 129, `agents/runtime` 85,
  `packages/creative-model` 55, `e2e` 51, `packages/three-runtime` 35, `scripts` 35, `packages/game-model` 26,
  `agents/exec-host` 25, `packages/ai-providers` 18; amendment 574 carries all nineteen and their sum. The two
  scripts that WOULD have covered them — `eslint` (`eslint .`) and `lint:main` (`npm run typecheck && npm run
  eslint`) — are named by no step of either workflow file, and still are: this increment ships a door that
  reaches the tree, it does not adopt the crashed script.
- **The crash was re-measured at the script's OWN argv, because the carrier is the argv.** Pointed at anything
  under `apps/studio`, with the root config at HEAD bytes and the exact command the manifest declares, ESLint
  10.11.0 answers in 4.5 s with exit 2 — `Cannot read config file: apps/studio/node_modules/eslint-config-next/index.js`
  under `Failed to patch ESLint because the calling module was not recognized`, `Referenced from: …/eslint-config-next/core-web-vitals.js`
  — and the probe's own reading of its stdout is `first line naming a graded file: NONE (nothing printed a path)`.
  A run made earlier answered differently, and the difference was MY command: it carried `--config <path>`, which
  suppresses the per-directory config lookup, so it never loaded the studio file at all. That invocation survives
  the crash and dies of the heap instead — exit 134, `Ineffective mark-compacts near heap limit`, 4079 MB at 202 s
  in, again with no verdict on any file. With this landing's bytes the same argv finishes (248 s, 223 findings,
  exit 1), because `apps/studio/**` is now in the root `ignores`; that run is still unreached by CI, and the gate
  does not depend on it.
- **Nineteen areas derived, two excused by name, and each excuse states its reader.** The areas are
  `git ls-files`'s own top-level directories, so a new one is graded the day it is committed — there is no list to
  forget. `apps/studio` (300 files) is excused by a reach chain the gate re-derives every run: its manifest
  declares `lint`, `npm run lint` walks it, ci.yml names that step, and the package is measured passing at its own
  bytes (eslint 9.39.5, `eslint . --max-warnings=0`, exit 0). It pins `eslint-config-next`, whose peer range is
  `^7.23.0 || ^8.0.0 || ^9.0.0` — the root's 10.11.0 is outside what that config supports, which is why the root
  run may not descend into it and why the exemption is a handoff rather than a pass. `UNLINTED EXEMPTION` reddens
  the day the `lint` script is gone. `.scratch` (24 files) is the other one: probes rewritten mid-run, each already
  graded by the arm that spawns it.
- **The ledger is (rule, file), and the four verdicts are about movement.** `docs/evidence/ci/lint-debt.json`
  carries **221 findings over 109 (rule, file) pairs in 16 rules across 91 files** — the families as this run
  prints them: `docs` 84, `packages/world-engine` 37, `packages/three-runtime` 28, `agents/runtime` 26,
  `agents/exec-host` 15, `tools` 15, `packages/ai-providers` 9, `packages/design-model` 6, and one finding each in
  `apps/web` and at the root. `UNDECLARED` refuses a finding the ledger never named; `GREW` refuses one above its
  ceiling; `LOOSE` refuses a ceiling the file no longer needs — debt that shrank silently is a red, because a
  ledger nobody keeps honest is a licence; `STALE` refuses a pair the file does not produce. `--write` may only
  move a ceiling DOWN, and the planted shape `moved-not-reduced` proves a sideways rewrite is refused rather than
  recorded: that is the laundering case, a "repair" that leaves the total intact while changing what it claims.
- **The basis is the INDEX, and the two readings must agree.** A count compared to a committed ceiling must be a
  count of the committed bytes, so every tracked lintable file differing from the index is re-measured through
  `eslint --stdin --stdin-filename <its own path>` before a verdict prints — `basis-control`,
  `basis-draft-overstates`, `basis-draft-hides-committed-debt` and `basis-row-erased` are planted shapes, not
  hope. At this ref 4 such files exist and one changes the number: `docs/evidence/java/spring-cloud-proof.mjs —
  the worktree says 4, the INDEX says 3; graded from the index, so stage your fix to have it counted`. That is the
  concurrent lane's uncommitted Spring Cloud edit, and the sentence is its handoff rather than my red.
- **Three totals, reconciled by name.** The gate prints 221 at the committed bytes; the worktree alone would
  print 222; `npm run eslint` at this ref prints 223. The attribution runs file by file: the root's run grades 92
  files where the ledger carries 91, and the extra one is `tmp_servicecall_orig.ts` — root debris dated Oct 24, 46
  lines, untracked, not this increment's to delete, and ESLint grades untracked files while this gate does not;
  the second unit is the 4-vs-3 above. 223 = 221 + 1 + 1 with every unit named.
- **Fifteen planted shapes run before a single real finding is reported.** Seven grade the verdict table, four
  grade the index basis, and four grade the exemptions: `linter-control` (a planted package declaring `lint` is
  excused and its own linter still runs), `linter-script-gone` (delete the declaration → `UNLINTED`),
  `linter-not-a-workspace` (a directory that only LOOKS like a package → `UNREACHED`), `linter-graded-not-exempt`
  (a package a step reaches but the file never excuses may not be silently dropped). §4b's pair is this
  increment's own hole projected onto the packages: no `lint` script is `UNLINTED`, and one no step names is
  `UNREACHED` — an exemption that outruns its reader is the same lie as a gate nobody calls.
- **A door is attributed to the STEP that walks it, or the print is a sentence about nothing.** The manifest
  census had one `runner`, so its caption — "the workflow's proofs step calls" — was true by accident: the only
  door disposed as a runner WAS the proofs step's. `verify:lint-tree`'s command is `node tools/ci/lint-tree.mjs`,
  outside `docs/evidence`, so the admission rule cannot derive it as a row; without a class of its own it would
  have landed as an undispositioned NAME. It is disposed as the second `runner`, and `runLinesOf` keeps the step
  name beside each run command so the pair is printed AND graded: `verify:proofs` → step "Evidence proofs",
  `verify:lint-tree` → step "Lint the whole tree against the debt ledger". Reshaping the fixture's step into a
  block scalar (arm `M25`) is what found the pairing itself wrong — a `- name:` line that closes a block was
  tested AFTER the block-exit branch, so the step named above a block kept ownership of every command written
  below it. The roster grows **131 → 132 arms** in twelve families (A19 · R10 · **M25** · T17 · N7 · X8 · S7 · C8 ·
  D14 · E10 · F2 · G5), and the number moves in every copy at once: the `// ROSTER` marker, the fixture README the
  census grades inside itself, this file's headline, and the ten arms that drift these numbers.
- **The two censuses, printed by this run.** `127 names close as 117 derived rows + 2 runner + 1 covered +
  7 deferred + 0 undispositioned, over 16 run commands the workflow actually executes`, and on the tools side
  `17 modules close as 2 runner + 4 reached + 7 named + 0 behind + 4 standby + 0 unreached, over a live closure of
  132 modules reached from 117 rows, the runner door and 5 declared tools`. The evidence population is unchanged at
  `129` modules (`117 row + 4 helper + 3 swept + 5 tool + 0 deferred · rows 116+1 · 0 unclassified`) — this
  increment's new file lives in `tools/`, which is exactly what the reach census was built to see. ci.yml's proof
  step moves **#11 → #12 of 13** because the lint door joins before it; §2 names that index and §4 the order after
  `build` step #9, and neither number is re-pinned by hand.
- **Instrument readings at this ref (2026-11-10, this box).** `npm run verify:lint-tree` **exit 0** — 19 areas +
  2 named exemptions, **1117** files, **221 findings over 109 (rule, file) pairs in 16 rules** exactly at their
  ceilings, 0 parse errors, 0 crashes, 15 planted shapes run first, basis: 4 file(s) re-measured from the index.
  `npm run verify:evidence-census` **exit 0** — its arms **132/132 MATCHED**, 119 refusations, manifest **127
  names close as 117 derived rows + 2 runner + 1 covered + 7 deferred + 0 undispositioned** over 16 run commands,
  tools **17 modules close as 2 runner + 4 reached + 7 named + 0 behind + 4 standby + 0 unreached**, and the
  evidence population unchanged at **129** modules. `npm run verify:ci-wiring` **exit 0** — all fourteen clauses,
  population **117 closes as 116 + 1**, §2's proof step now **#12 of 13** with `build` at #9, §9 **22 of 116**
  rows declaring their own budget and 0 refused, §11 a 60 min ceiling against the rows' own 667 min, §12 **115 of
  116** ending on a literal print, §13's longest whole tail **293 bytes**, §14 **22** legs with 0 orphaned and 0
  untyped. `npm run verify:arms` **57/57 arms matched (34 gate incl. the control, 23 runner)**, planes removed;
  `npm run verify:arms-freshness` **9/9 fixture arms**; `arms-receipt.json` re-stamped by that run at **57 arms /
  8 subjects / 117 derived rows**. `npm run typecheck:main` **exit 0**; `npm run evals` **exit 0** with all ten
  suites' structural invariants PASS and `demo-mode` at **14/14**. The root script both ways: at HEAD's config
  bytes with its own argv **exit 2 in 4.5 s** and not one file named, at this landing's bytes **exit 1 / 223
  findings / 248 s** — and neither is a step in either workflow file.

- **The record gates read this landing's own words, and say so clause by clause.** `npm run verify:table-recount`
  **exit 0**: its §7 prints **the newest grant 574 IS titled**, and proves that is a condition rather than a free
  pass by scrubbing this section's heading numbers on a copy and re-reading — the refusal becomes
  `unrecordedNewest:574` and the title hole gains 574 — over **561 ledger headings** and a **253-file** record
  corpus, with **0 dangling** explicit citations, **8 grants titled nowhere** (242, 248, 249, 250, 251, 252, 253,
  254, each named beside whatever carries them instead of a record) and **none granted twice**. Its §2 recounts
  the suites at HEAD's bytes — runtime **640 cases over 43 files**, exec-host **358 over 13**, the run's 44th
  runtime file (`buildArc.test.ts`) unowned by the graded state and therefore not counted — and §5 catches
  **4/4** planted table mutations with the same reader that calls the real table clean. `npm run
  verify:record-window` **exit 0**: **7 doors × 2 budgets** with sentence and record agreeing, exactly **1 key**
  (`windowed`) that a truncation adds and a whole read does not have, and the aggregate bit alone refuted by
  `exec.run` at 28 B of stdout kept of 28 B with 9 000 B of stderr cut. `npm run verify:record-encoding` **exit 0**
  — **0 chargeable lines**, over **2 125 graded files** out of **2 139 names** of which 14 are binary, with
  **3 956 flank-rejected look-alike render sites in 617 files** and the rows ledger paired **116/116** one-for-one
  onto 116 distinct tree lines. The CARRIER of that population is `git ls-files` — the index, not the tree; the
  walk is the branch a plane with no git falls to — so the two files this landing writes joined the graded set when
  they were STAGED (HEAD answers 2 137 names, the index 2 139), the delta from amendment 573's **2 123** is exactly
  those two files, and a scratch file sitting in `.nexus-tmp` is graded by neither plane.

### v650 — CI built ONE of the four Maven modules the commit owns: §15 derives the pom roster from the index and refuses a `mvn` line that names nothing, skips tests, or hashes a cache key over one of four paths (ADR 0016 amendment 575)

- **The hole, counted from the two files and the index.** `git ls-files` tracks **4** `pom.xml`, and at HEAD
  exactly one of them is named by a `mvn` line in either workflow file: ci.yml's step "Warm the Maven repository
  (the service-suite row runs offline)" runs `mvn -B -q -f services/nexus-api/pom.xml test`, and
  `main-line.yml` carries no Maven command at all. So `java-registry`, `java-gateway` and
  `java-domain-service` had no CI reader — **45 tests over 9 test classes** (registry 2/1, gateway 4/2,
  domain-service 39/6) that the build never ran, beside the 917 tests over 46 classes of the module it did. The
  same step's `cache-dependency-path` was the single string `services/nexus-api/pom.xml`: a change to any of the
  other three poms re-used a cache whose key was computed from a file nobody touched, which is the failure shape
  v646 named for a typecheck leg and this is the Maven copy of it.
- **Those numbers are a measurement, not an inference.** Four `mvn -B -f <pom> package` runs at HEAD's bytes on
  a detached plane of this tree answer exit 0 and write surefire XML; counting that XML gives
  **962 tests over 55 test classes** — `nexus-api` 917/46, `java-domain-service` 39/6, `java-gateway` 4/2,
  `java-registry` 2/1. The hosted log agrees about the one module CI ran: step
  `23:11:52 → 23:12:27` in run 42717848504 completed, under `bash -e`, with the suite inside it.
- **The rule, stated so a fifth module cannot be forgotten.** The population is the commit's own poms
  (`git ls-files` — the index, the same basis every other census here uses; a plane with no git falls to a tree
  walk and says so). A command *reaches* a module when it runs `mvn` with `-f`/`--file` naming that pom, does not
  skip tests (`-DskipTests`, `-Dmaven.test.skip` — and `-DskipITs` deliberately is **not** a skip, because
  integration tests are a real phase), and names a phase that bears tests (`test`, `package`, `verify`,
  `install`, `integration-test`). Four refusals, in the order the clause reads them: no `mvn -f` line at all
  (`§15 read 0` — vacuity, the reader that sees nothing certifies nothing); a pom named by a step that the commit
  does not own (a phantom path, which is the hosted run that passes while the tree it describes does not exist);
  an owned pom no command reaches, or one reached only by a command that skips its tests; and a
  `cache: maven` key that hashes fewer paths than the commit owns, or hashes one it does not own.
- **Why four explicit lines rather than a glob or a reactor build.** `mvn -f services/*/pom.xml` is expanded by
  a shell, not by the file, and a repository with no root `pom.xml` has no reactor to name — so either shape is a
  command this clause cannot attribute to a module, and **a command the census cannot attribute is a command the
  census cannot redden**. The four lines are written out, one per module, and adding a Maven module means adding
  a fifth line: until you do, §15 is red and says which pom has no reader. `phase` is `package`, not `test`,
  because the java proofs resolve jar-shaped dependencies a bare `test` does not build, and the warm-up exists to
  serve them.
- **Six arms and two controls, and every one of them lands on the frontier.** The roster moves **57 → 64 arms
  (41 gate incl. the control, 23 runner)**. `A29-registry-mvn-line-deleted`, `A30-registry-warmed-without-tests`,
  `A31-phantom-pom-named-by-a-step`, `A32-every-maven-line-deleted`, `A33-cache-key-collapsed-to-one-pom` and
  `A34-cache-key-names-an-unowned-pom` each answer `first red at §15, 14 clause(s) below it, none above, exit 1`
  — the refusal is reached, its words are in stderr, and nothing the row graded before it moved. `C7-a-pom-named-only-in-a-comment`
  is the control that makes the comment-dropping rule a door rather than a convenience: a pom named only by a `#`
  line inside a run body is **not** a reader, and with that plant in place the gate still prints all fifteen
  clauses and exits 0, exactly like `C0-control`.
- **The row's own budget moved because the row was measured (#340).** `// sweep-budget-ms:` was `900000` while
  the two back-to-back local runs of the 64-arm set took **15 m 16 s and 15 m 21 s** (916 s and 921 s against a
  900 s declaration; the second with two Maven builds sharing the CPU). The declaration is now `1050000`. This
  is not cosmetic: §9 reads each row's marker and §11 turns the markers into a job-level worst case, and a row
  whose declaration its own slowest plane overshoots is KILLED by the runner and reported as a failure it did
  not have. The last hosted reading this file carries is run 41428780884 — 49 arms in 122.0 s — so the budget is
  the slower of the two planes plus headroom, and the header comment says which is which.
- **Instrument readings at this ref (2026-11-10, this box).** `npm run verify:ci-wiring` **exit 0**, all fifteen
  clauses: `[§15] 4 pom.xml owned by the commit, 4 `mvn -f` line(s) across 2 workflow file(s), ALL reaching a
  test-bearing phase without skipping tests · 0 phantom path · 1 `cache: maven` step(s), 1 with an explicit key
  over 4 path(s)` — "2 workflow file(s)" is the population the clause read, not a claim that both carry Maven.
  Population **117 closes as 116 rows + 1 residue**, §2's proofs step at **#12 of 13** with `build` at #9, §9
  **22 of 116** rows declaring their own budget with `verify:arms=1050000ms` and **0 refused**, §11 a **60 min**
  job ceiling against the rows' own **670 min** worst case, §12 **115 of 116** ending on a literal print, §13's
  longest whole tail `verify:record-window` at **293 bytes**, §14 **22** configs with 0 orphaned and 0 untyped.
  `npm run verify:arms` **64/64 arms matched**, planes removed; `arms-receipt.json` re-stamped by that run at
  **64 arms / 8 subjects / 117 derived rows** on 2026-11-10T00:28:10.283Z, and
  `npm run verify:arms-freshness` green beside it — which is why the battery is the LAST write this landing
  makes to a subject file: §2 of that door reddens when any subject's bytes move after the stamp, so the
  15-minute run has to come after the editing, not before it.
- **The record gates read this landing's own words.** `npm run verify:evidence-census` **exit 0** with
  **132/132** arms matched: ci.yml's run commands move **16 → 19**, because four Maven lines replaced one, and
  the census grades reach rather than verdict, so its manifest line needed no re-pin and its
  **129**-module evidence population did not move (this increment adds no file). `npm run verify:table-recount`
  **exit 0**: the newest grant **575 IS titled** — by this section's heading, which is what §7's positional title
  reader requires — over **562** ledger headings and the **253-file** record corpus, **0 dangling**
  explicit citations, **8** grants titled nowhere and **none granted twice**. `npm run verify:record-window` and
  `npm run verify:record-encoding` **exit 0** — the latter at **0 chargeable lines** over **2125** graded
  files of **2139** names. `npm run typecheck:main` **exit 0**.
- **What this does NOT claim.** Not hosted green: these bytes have not run on the host, and the last hosted run
  reddened on three rows whose claims are keyed to the box rather than to the contract (v651a/b/c, filed and
  diagnosed — a 25-second floor this box's docker-proxy pays and the runner's kernel does not, an integer
  `uptimeSeconds` that can fail to cross a second boundary inside a fast outage, and a `no exit code reported`
  sentence for a child that exits with a code on Linux). Not a verdict about the 962 tests: §15 grades a REACH —
  a step naming a pom with a test-bearing phase — and says nothing about whether those tests pass; the surefire
  counts above are the population the wiring now reaches, and the four `package` runs that produced them are this
  increment's own witnesses on this box. Not a census of every Maven command in the repository: eight proof rows
  build `services/nexus-api` inside a temp plane with `mvn -B -q package -DskipTests`, which is a command §15
  would refuse twice over (no `-f`, and a skip) and does not read at all, because the clause charges the
  workflow; and `docs/evidence/java/spring-cloud-proof.mjs` builds all four modules and is the **1 residue** §6
  names for want of a PostgreSQL no workflow step brings up. Not a rule about `if:`-gated jobs: §15 reads run
  commands, and a step in a job that never starts still counts as a reader. And the amendment's version label is
  re-aimed: amendment 574's grant sentence predicted **v648** for 575, this landing minted **v650** instead,
  because the two increments that queued between the promise and the landing keep their own labels and land
  after this one — a version label is minted by the commit that lands, and the promise is corrected here rather
  than left to rot.

### What this does NOT claim

Deriving the population has a limit listing does not have to admit: a module under `docs/evidence` that was
never turned into a `verify:*` script stays invisible to the build. Amendments 516–519 closed that half:
the census below gives every one of the **134** tracked modules a disposition, and the derived population is
**119 running rows + 0 excluded by name** at this ref (the v645 exclusion is retired — the spring-cloud
proof establishes its own scratch pgvector source container on the hosted plane — and the residue this
sentence once carried is now zero). v532 triaged the
swept population and wired sixteen
Node-only proofs; v533 ran the sweep over all 81 and wired the forty-eight green dist+spawn proofs). And no
gate here can make GitHub run: it reads bytes
committed in this repository, and whether the workflow executes on `master` is knowable only from the real
runs — it ran red (`40603544099`, sha `3026dad`, amendment 515's four exec-host cases on ubuntu), then green
four times (`40659064493` (sha `5790b3f`) with 12 rows, `40662063095` (sha `c4db552`) with 17, `40664659344`
(sha `49fe29f`) with 20, `40682580110` (sha `28a8930`) with 36), then red again on the first run that carried
all 84 rows (`40693312992` (sha `ea3cabb`): 78/84 green, six platform reds, repaired at v534 — the row-by-row
account is below), which is the evidence this section was waiting for.

## The evidence census — every tracked module is a row, a helper, a swept proof, a tool, or a deferral (amendment 516 at M0/v530; amendment 517 at v531 wired the three lane proofs; amendment 518 at v532 wired sixteen swept proofs; amendment 519 at v533 wired forty-eight more; amendment 520 at v534 repaired the six ubuntu reds that population's first full run found; amendment 521 at v535 wired the last thirteen green swept proofs; amendment 522 at v539 repaired the one ubuntu red those thirteen's first contact exposed — a POSIX clause that could never fire; amendment 525 at v542 added the arms-receipt row and its helper; amendment 526 at v543 checks this table's five class counts, its run/residue split and both prose numbers against the census's own derivation, and reddens on drift)

```
npm run verify:evidence-census   # a row inside the population it counts
```

Every tracked module under `docs/evidence` now has a disposition, and the build re-derives all of them:

| class | count at this ref | how it is decided |
| --- | --- | --- |
| ROW | **119** (119 run + 0 excluded) | a `verify:*` script whose whole command is one `node` call into `docs/evidence` — proof-set's own `PROOF_COMMAND`, imported, never retyped |
| HELPER | **5** | import closure from every `verify:*` node target and every declared tool, through `sweep.relativeSpecs` (code position only): `agents/sweep.mjs`, `lib/syncproc.mjs`, `m9/wire-fields.mjs`, `ci/arms-receipt.mjs`, `m9/plane-bound-claims.mjs` (added 2026-11-10 — the import closure of the two repaired m9 proofs; committed in 9ab2371) |
| SWEPT | **3** | the agents sweep's own population, read by CALLING `sweep.trackedProofs('HEAD')` — at this ref `cwd-axis` and `tree-axis`, the tree-motion witnesses, which stay there by measurement (their verdict is about whether the walked tree moved during the run), plus `agents/record-repair-proof.mjs`, which the sweep runs and no `verify:*` script claims |
| TOOL | **7** | declared in the proof's `ROSTER` with a reason and a command a reader can re-run (two mutation probes, one plane-arms script, the isolated-build arms, the SVG generator, plus the two DS arms: `complexity-arms.mjs` and `single-map-ab.mjs`) |
| DEFERRED | **0** | none at this ref — the three Studio lane proofs v530 deferred are ROWS since v531 (the workflow pre-pulls `node:22-alpine`, their one blocker). The class and its refusals stay for the next proof a sandbox really blocks |

Anything else is `UNCLASSIFIED` and exits 1 naming the file. Stale records are refused too: a roster entry the
commit no longer owns, a declaration shadowing a derived class, a reason a reader cannot falsify, a row target
the commit does not own, an import of a file the commit does not own, an exclusion that retires no row. **132
fixture arms** prove each refusal on a synthetic plane — the nineteen above, ten that drift one README number
each, twenty-five that dispose the manifest's blind side, seventeen that dispose the tools corpus behind it (the
next three blocks), seven that grade the numbers those deferrals state, eight that recompute the roster this
sentence lives in, seven that grade the marker the proof carries in its own header and eight that grade the arms
list itself, fourteen that date the durations published further down this file, ten that re-derive the commits a hosted claim
names, two that refuse a run number the paragraph writing it leaves without an address, and five
that grade an address the word sha never names; the prose-import arm
proves the tokenizer is the sweep's, not a byte regex.

**The manifest's other half.** The population above is `git ls-files -- docs/evidence`, which answers "does every
evidence module have a channel?" and says nothing about the mirror question: does every `verify:*` NAME have one?
The admission rule `PROOF_COMMAND` admits only the scripts whose whole command is one `node` call into the
evidence tree, and every script it drops used to fall out of the census in silence — the same hole amendment 514
named for modules, one level earlier. `MANIFEST` in that same proof disposes them in three classes, each read off
bytes rather than off the entry's own prose: RUNNER (the workflow's run lines contain `npm run <name>`, so the
door is the one CI walks), COVERED (a workflow run line names the same tool against the same tracked subject path,
with comment lines dropped, because `cache-dependency-path: services/nexus-api/pom.xml` is prose about a pom and
not a test run), and DEFERRED (nothing in CI runs it; the script's own code must import the module it blames, and
it states the measurement, the blocker and the next repair — the three fields a deferred evidence module already
answers to). A `verify:*` name in none of those classes reddens the row by name, and so does a disposition whose
script is gone, a duplicate, one shadowing a derived row, a target the index does not own, a runner whose step
moved and a reach that lives only in a comment. The census prints the closure — names, derived rows, one runner,
the covered claim resolved to the exact workflow command, every deferral with its reach — on every build, so the
counts live in the row's own output rather than in this paragraph.

**The third population: the modules the doors point at.** Two censuses over names still say nothing about the
runnable modules under `tools/`, and that corpus is where the deferred doors actually live, so the same proof reads
`git ls-files` a third time and gives every runnable module under `tools/` a disposition. Liveness is a closure, not
a lookup: it starts at the derived rows, the runner door and the declared tools and follows only the imports a
module's code really makes, so `RUNNER`, `REACHED` (a row, or anything a row reaches, imports it), `NAMED` (a
`verify:*` name `MANIFEST` disposes targets it — its reason lives in that entry, which is what makes the two
censuses interlock rather than duplicate) and `BEHIND` (only a door the build defers reaches it, so it is derived
and printed rather than declared) all cost no prose. The fifth class, `STANDBY`, is declared, and it is only legal
when nothing derives it: the entry states the measurement, the blocker, the next repair and a WITNESS — either a
module whose code-position bytes hold its path as a string value (the dynamic-import case, where a grader reaches
its tool through `await import(pathToFileURL(join(root, TOOL)))` and no specifier reader can see the edge) or a
derived row that grades the same face. A comment quoting the path buys nothing, a replacement that is not a row
buys nothing, and a module no class reaches reddens the build by name. The bound is stated rather than hidden: the
closure sees `from '…'` and `import('…')` only, so a row that *spawns* `node tools/x.mjs` is invisible to it, and a
standby is the honest record of that case rather than an accusation.

**A deferral's numbers are graded against the bytes it blames (v609).** Eleven deferrals between them state
"684 lines" and "a Studio served on 127.0.0.1:3210", and until this clause nothing re-read either — the same rot
v543 killed in this file's own table by recomputing its cells, found live again the day it was written: the container
driver reads **95** lines to a reader who counts its last line even when it carries no terminating newline, and v608
wrote 94. `gradeMeasured` runs on every declarable deferral the census holds — a `MANIFEST` deferral against the
module its own script calls, a `STANDBY` entry against the module it stands down, a deferred `ROSTER` entry against
its own file — and refuses four things: a `N lines` claim that is not the count of THAT module (a number true of a
file the entry merely mentions is red — the entry's evidence is about one file, and grading it against another is
how a stale claim survives), an address the blamed bytes never ask for, a measured field stating NEITHER kind of
claim, and a module the commit owns but this box cannot read. A duration or a count of checks stays prose ABOUT a
measurement rather than a re-derivation of one, and the clause says so instead of pretending to grade it; a hosted
run number left that class at v626, where the commit beside it is re-derived, and at v630, where a paragraph that
writes the number without one is refused. The next drift a reader spots in an entry this clause grades is a red the
build raises, not a correction someone owes.

**The roster number in the sentence above is recomputed, not trusted (v610).** The row prints its own tally
(`[arms] N/N MATCHED`, N counted from the list) and that is the fact; the prose that restates it is a copy — which is the exact failure v543 caught in the class table two sections up,
left out of that repair. So `armsRoster` counts the list from the arm NAMES (one family per prefix, in the order the
arms first appear: adding an arm moves a number by itself) and `readmeArmsDrift` grades this file's sentence against
it. The headline `**N fixture arms**` must equal the length of the list; the breakdown must state every family as
"<number word> above" or "<number word> that …" in that same order, bounded by the prose-import clause that closes
the sentence. Seven refusals follow, armed by eight arms X1→X8 — X1 raises two of them and X8 aims at the family
refusal from the other side: a headline the list no longer matches, a breakdown that no longer adds up to its own
headline, a family whose count is out of date (named by family, and saying plainly when two were merely swapped), a
family dropped or claimed twice, a state that is not a number word this reader parses, a headline written in a shape
nothing reads, a breakdown reshaped away or with its closing bound moved. The cost of that grammar is stated rather
than hidden: any other "<word> that" inside the region is taken for a family claim and refused as an unparseable
number, so the sentence keeps one shape or the row goes red and asks for the edit.

**And the copy inside this file is graded like the one outside it (v611).** The proof's header quotes the same
roster in one marked line — the shape is `// ROSTER <n> arms in <k> families — <label><count> · …`, and this
paragraph quotes the shape rather than the bytes because nothing grades prose here, so a number copied into it
would be a fourth copy of a list that moves every time an arm lands. The census reads its own bytes every run, and
grades that line against the same roster the README sentence above answers to: the total, the family count, the
count in every pair, the pairs' sum against their own headline, and the shape of the line itself. Four arms S1→S4
aimed at those refusals at v611 — a stale total, a marker deleted, one pair the list does not count, a marker
rewritten out of its grammar — and S5→S7 aim at the pairs' arithmetic, landing with the increment below. What the
clause refuses to grade is stated as plainly as what it grades: the header's historical
prose keeps its numbers, because a count written about a roster at one commit is a record while the marker is a
claim about the roster now, and the marker keys only on this file's own arm names, never on the tracked-module
counts — those move under a shared working tree, and a clause that reddened the build for work another lane
has in flight would be a hazard, not a gate.

**The arms list is asked what it proved (v624).** An arm is a name, a patch and a check, and until this clause
nothing said what the check had to catch: `[arms] N/N MATCHED` measures that each arm's check FOUND a refusal, not
that the refusal it found is one this file authors, so an arm asserting a sentence nobody wrote passes on a plane
where nothing was proved. `refusalSites` therefore indexes every refusal the proof writes, keyed by the function
that says it and the order it says it in, taking the message's literal text with its `${…}` holes cut out — at this
ref **93** refusations, plus **7** pushes that forward a list another function wrote, counted and not indexed
because their text belongs to the function that authors it. `armCoverage` asks one question per refusal: which
arm's own run produced a violation that text matches? Seven refusals follow, armed by C1→C8 on a fixture plane of
their own — a synthetic proof with three refusations, two sets that reach them and one declaration, because the
real list cannot witness itself: a push this reader cannot close, a refusal no arm reaches that no row declares, a
declaration naming a site this file does not author, one site excused twice, a declaration without a falsifiable
reason or without the arm it owes, a declaration whose refusal an arm now reaches, and an arm that produced a
refusal no site authors. `UNARMED` is the debt table for a refusal no arm reaches; it held eighteen rows when this
increment started and holds none now, because each of them turned out to be armable with the cheapest patch that
raises the sentence it names. Thirty-eight arms landed here — eight that grade the coverage grader, eighteen that
pay the debt those rows carried, twelve for refusations no row had ever claimed — and the two closure refusals,
which ask whether the classes add up to the listing they were read from, turned out to be reachable through that
listing: a path arriving twice from `git ls-files` collapses in the class map, the sum comes up one short of the
population, and nothing else would ever have noticed. The cost of the index is stated rather than hidden: a doc
comment that quotes the call WITH its opening bracket is taken for a site and reddens the row, because a refusal this
reader cannot find is a refusal this reader cannot count. A roster this long writes its family counts as compounds, so
the reader of the sentence above learned them — `twenty-four` parses, `fifty-odd` is still refused. Two bounds, named:
the index grades this file's refusals only (another proof's arm list is that proof's own tally), and it asks the
weaker, re-runnable question — that the sentence an arm raises exists here — rather than proving the arm's patch
caused it. One record-keeping note, because a shared history rations its numbers: this increment was written as v612
and lands as v624 — amendment 555 took v612, and v613 to v623 went with it, in other lanes while these arms were
being written — so the label a reader should cite for this clause is the commit whose subject says v624.


**A published duration is a measurement, so it ages exactly like a count (v625).** The census has read this
file's class table since v543, a deferral's line counts since v609, the arms roster in two copies since v610
and v611, and the arms list itself since v624. The set of numbers it had never read was its OWN table of
durations: four rows under one headline date, 2026-10-28, while three of the four files the rows named had been
committed since. A timing describes bytes, so it goes stale the way a count does, and the headline was the shape
that hid it — one day for four files is a day nobody is ever asked to move. `authoringTableDrift` now
walks the table: the header must state the three columns and carry no date, every row must name a row this census
runs and THE file that row runs (the short `m9/audit-contract-proof.mjs` form named a path no `verify:*` command
contains), state a duration the reader parses and an ISO day, and that day may neither postdate the day the
census runs nor precede the last commit touching that file — read from `git log -1 --format='%ct %h' --
<path>`, so a row that outran its own bytes is named with the ref that overtook it. Fourteen refusals, armed by
fourteen arms D1—D14 on the fixture plane, where D2 rewrites the header into the exact headline shape that
went stale here. Two bounds, named: the table is a CLAIM SET, not a census of times — a row absent from it
is nobody's lie, and this box holds a measured duration for four rows, not for the rest of the build; and the
comparison is by local calendar DAY rather than by instant, so a commit landing the same day a human measured
passes, because the run may have started before the sentence was written. The day is spelled from
getFullYear/getMonth/getDate rather than `toLocaleDateString('en-CA')`: an ICU-less Node renders that as
`en-US`, and a M/D/YYYY string cannot be ordered against a YYYY-MM-DD one.

Four rows that needed nothing but Node walked through the door in the same increment; the four days below are
per row, because one headline dated a table whose files had each moved on their own schedule:

| row | proof | measured on the authoring box |
| --- | --- | --- |
| `verify:audit-contract` | `docs/evidence/m9/audit-contract-proof.mjs` | 28.4 s on 2026-11-08 — reads the service's Java record and the client model, then asks the TypeScript compiler; four runs of the bytes amendment 567 lands took 17.3, 26.3, 28.4 and 47.6 s, all `exit 0`, so the spread is this box's and the row's own number is the one a reader should re-time, not trust |
| `verify:record-encoding` | `docs/evidence/agents/record-encoding-proof.mjs` | 6.2 s on 2026-11-12 — the record corpus's encoding census (120 000 ms own budget) — re-run and re-dated after `1fb4d12` appended the one ISLAND pin to LOOKALIKE (the v670-strand line); it exits 0 |
| `verify:pipeline` | `docs/evidence/studio/pipeline-proof.mjs` | 0.3 s on 2026-11-06 — prompt, design-model ops, layout, undo/redo, AI diff |
| `verify:table-recount` | `docs/evidence/agents/table-recount-proof.mjs` | 95.1 s on 2026-11-06 — boots vitest and reconciles this directory's README table (300 000 ms own budget) |

Two of them (`record-encoding`, `table-recount`) are ALSO in the agents sweep's population; the census prints
that overlap every run — double coverage, not a conflict.

**A hosted claim names a commit, and a commit is something this clone can answer for (v626).** v609
bounded a run number as prose ABOUT a measurement, and the bound held for the log: no checkout can replay a
runner's stdout. It can answer what the commit that stdout tested held, so where a hosted sentence names the commit
its run tested, that half of the bound lifts and the reader below grades it. `hostedClaimDrift` reads each
claim out of its PARAGRAPH — the file wraps, so an address and the population the same run printed sit lines
apart — resolves the address it names against HEAD's own history, re-derives the population from the
`package.json` committed AT that ref, and dates the run written in the parentheses around the address against
that commit's own UTC day. What the census prints on every run, rather than what this sentence copies, is the
count: how many addresses the file holds, how many distinct commits they resolve to, how many populations were
re-derived and how many claims stated no address before them. A run number written with NO address in its
paragraph was prose in this telling — v626 left it out of reach on purpose, and v630 closed that half, so
the record of the anchoring is its own paragraph below rather than a bound here. Ten refusals, armed by ten
arms E1 to E10 on the fixture plane: no ref facts handed to the census, an address that is not an address, an
address no
commit answers, an abbreviation two commits share, a commit off this history, a population the commit does not
derive, a date in no readable shape, a date before the commit landed and one a push cannot account for, and one
run claimed against two commits. Three bounds, named rather than left to the reader: the green FRACTION is not
graded, because a selection run answers one row green out of the population it counted, and the one counts the
rows a person asked for; a claim at a ref where `derivePopulation` itself has since changed is DECLINED and
printed, because it was true of the rules of its own time and no number read today can call it a lie; and the
clock is UTC on both sides here, unlike the table above, which this box's own calendar dates — the runner stamps
its start in UTC, and so does a commit.

**A run number names the commit its run tested (v630).** v609 bounded a hosted run number as prose ABOUT a
measurement, v626 graded the half a clone can answer for, and the bound v626 left standing was that a number
with no address in its own paragraph stayed out of reach. Measured against HEAD before this line was written,
the file held twenty-three distinct run numbers and fourteen of those mentions sat in a paragraph naming no
ref: nine named no commit anywhere in the file, and the other two carried an address three sections away,
which is a copy rather than a claim about the sentence that printed the number. Both were read off the host
with `gh run view <id> --json headSha,createdAt`, read-only, and every one answered with a commit on this
history landing the same UTC day its run was stamped, so the bound lifts where this file can meet it: eleven
edits now carry thirty addresses over twenty-three distinct commits, and `hostedClaimDrift` refuses a
number whose paragraph names no ref. Two arms raise the roster to 126 in 11 families: F1 appends a bare
number, F2 strikes the address off a number that already had one. Four bounds, named rather than left to the
reader: an address with no number beside it stays legal, because a verdict may be recorded by ref alone; a
date is graded only when the paragraph states one, and seven of the fourteen new anchors carry none, because
a dense run list reads as a list and a date on every entry would be noise; what is graded is a claim's
CONSISTENCY with the ref, not the host's identity, since "this run tested this commit" is read off the host
by a person and what this clone can answer is that the commit's own bytes do not contradict it; and a
nine-to-twelve-digit number inside backticks is taken for a run id whether or not it is one, because every
number in that shape this file writes is a run, and the day a different one lands the red asks for a word
beside it rather than guessing which numbers are evidence.

**A bare address is an address, and what it buys is narrower (v631).** v630 refused a run number whose
paragraph named no ref, and the file it grades had been naming refs all along in the one shape a reader
cannot mistake: a hex token between backticks with the word `sha` left off. Measured against HEAD before
this line was written, the graded file held nine distinct tokens of that shape: eight resolve to exactly one
commit on this history, and one — `b4fa34d49cd20e2e`, the Maven digest v547's row prints, resolves to
nothing, so the census reads it as a digest and spends no git call on it. Reading the eight as addresses takes
that file from thirty spelled claims over twenty-three commits to thirty-nine over the same twenty-three: the
shape was already in use for commits this record names in prose, not for new ones. Then the sight went
outward, because a class found in one file is rarely in one: eight other tracked evidence READMEs, six of
them writing at least one token of the shape, seventy-eight resolving to a commit here, none ambiguous,
twenty-seven resolving to nothing, eight run ids and one of them in a paragraph naming no address. Those
bytes belong to the lanes that wrote them, so this census prints the answer and refuses nothing — another
lane's bytes are another lane's edit — and the count stands as the record of how much of the class is still
out there, and how much a lane has to do if it wants its own README graded.

What a bare token BUYS is drawn where a measurement drew it. The v553 bullet measured a worktree cut from sha
`03279a2` plus the change it was wiring: that build reported 104 rows, while the commit itself, re-derived by
this census, gives a derived population of 103 — a base is not a build. Grading a bare token's numbers
would have refused that sentence for a thing the sentence never claimed, so the rule splits: a bare address
ANCHORS — it satisfies v630's "the paragraph names the commit", and it enters the identity map, where the
lie worth catching is one run spelled against one commit and cited bare at another — and it receives
neither population nor date grading, which stay attached to the last spelled address in their paragraph or
print as UNOWNED, six at this ref and the same six v630 printed. One refusal is new, and it is the failure
mode the bare shape invites: a token two commits in this clone share, written beside a run number or a
population, is red, because an abbreviation with two answers is not an address. Measured zero such tokens in
this file and zero in the eight. Five arms carry the rule — G1 strikes the word `sha` off a hosted claim
and asserts it stays anchored with its numbers ungraded, G2 anchors a run on a bare address this history does
not carry and asserts the census still calls it unanchored, G3 writes the shared abbreviation, G4 writes a
token that resolves to nothing and asserts the refusal is about the missing address rather than a token the
census declined to call an address, G5 spells one commit and cites another for the same run. The roster is
131 arms in 12 families.

**v531 — the deferral that named its blocker was repaired first.** The three Studio lane proofs are build rows:
`verify:build-lane` (5.5 s), `verify:container-lane` (1.5 s) and `verify:deploy-lane` (6.1 s) on the authoring
box (2026-10-28, docker present, `node:22-alpine` b6f26b36c8ff). The workflow now runs `docker pull
node:22-alpine` BEFORE `Evidence proofs`, because exec-host spawns every container with `--pull never`: on a
fresh runner the image does not exist, and without the pre-pull the red would name the image cache rather than
the lane. The census derives the three as rows and their deferral entries are deleted — a deferral that
outlives its blocker is the same stale record the census refuses in the other direction. On docker-less
planes `verify:proofs` now reddens on these three with "no such image", which is the honest prerequisite.

**Measured, on the day the census shipped (2026-10-28).** `npm run verify:evidence-census` prints **111 tracked
modules = 20 row + 3 helper + 79 swept + 6 tool + 3 deferred · 0 unclassified · rows 17+3**, with **14/14 arms
MATCHED**. The four new rows' ubuntu verdict arrived with run `40662063095` (sha `c4db552`, 2026-10-28; the 17-row population's first
run, fully green): **17/17 rows green**, `audit-contract` 1.5 s, `record-encoding` 1.0 s, `pipeline` 0.1 s,
`table-recount` 16.9 s, `mutation` 55.4 s, job 3 m 19 s. At v531 the census prints **111 = 23 row + 3 helper +
79 swept + 6 tool + 0 deferred · 0 unclassified · rows 20+3**, arms still 14/14, and the wired workflow reads
as 10 steps with the proof step ninth and the build seventh.

The mutation row's scratch box is now **per process** (`.nexus-mut-probe-<pid>`). v530's own full-set run
overlapped a still-running earlier one, and the loser reddened with `ENOENT` on the winner's cleanup — a red
that named the sandbox, not the code. One box per run means the two cannot meet.

**v532 — the swept population was triaged, and sixteen rows walked through.** The 79 swept proofs were
scanned with their comments stripped: 2 clean of every marker, 65 importing a shipped `dist`, 3 reaching
docker/`tools/harness`, 9 starting a child. Of the 65, the 17 that start no child of their own were measured
against the built tree — a built `dist` is a prerequisite the workflow already meets (Build #7 precedes
Evidence proofs #9). Sixteen are rows now, each named by its own `verify:*` script and its own timing on the
authoring box (2026-10-28): `agent` 0.2 s · `dom-ui` 0.1 s · `execsuite` 3.1 s (it boots a vitest suite
through the exec sandbox — the child IS the graded subsystem) · `index-store` 25.1 s · `index-vectors` 97.4 s
(declares `// sweep-budget-ms: 300000`) · `memory` 19.0 s · `memory-vectors` 0.2 s · `planner` 0.2 s ·
`provider` 20.5 s · `qa` 0.3 s · `recall` 30.3 s · `repair` 0.2 s · `rolechain` 0.2 s · `roles` 0.2 s ·
`testrunner` 0.2 s · `vector-store` 2.3 s. One of the seventeen was repaired on the way in: `vector-store`
built its corpus from `collectTextFiles('.')`'s alphabetical first 120 files, and this worktree's `.scratch/`
junk consumed the whole window — the corpus is the repository's SOURCE, so dot-directories are now filtered
(the same rule amendment 149 made one directory narrower). And one stayed SWEPT as a **named red**:
`code-index`'s second query no longer holds `apps/studio/src/lib/persist.ts` in its top-5 on the grown
corpus — measured, the miss survives a dot-filtered corpus, so it is a stale expectation rather than worktree
junk; its repair is the next named work, and until then the red is a sentence here, not an unopened door.
The census prints **111 = 39 row + 3 helper + 63 swept + 6 tool + 0 deferred · 0 unclassified · rows 36+3**,
arms 14/14; `verify:ci-wiring` reads population **39 = 36 + 3**, four rows declaring their own milliseconds,
0 refused. The full derived set over this increment's final bytes printed **36/36 green · residue named 3**
on the authoring box (2026-10-28), the new rows inside it at the times above (`index-store` 43.4 s,
`index-vectors` 100.3 s, `recall` 27.5 s, the rest under 20 s, ten of them sub-second). The 63 still-swept
are: 48 dist importers that also start a child, 9 spawn-only (the sweep
runner's own witnesses, plus `isolated-proof`'s 900 000 ms isolated builds and `timeout-axis`'s deliberate
timeout), 3 docker/reach, 2 axis witnesses (`cwd-axis`, `drive-axis`), and `code-index`'s red.

**v533 — the sweep ran itself, and the green half walked through.** The triage instrument for this batch was
the repository's own sweep, run whole over HEAD `28a8930`'s 81 tracked proofs: **76 OK · 5 FAIL · 0 TIMEOUT in
987 s**. The forty-eight OK rows that import a shipped `dist` and start only git/node are build rows now,
each named by its own `verify:*` script and its own timing on the authoring box (2026-10-28): `asset-tools`
1.3 s · `bridge-report` 12.5 s · `budgets` 8.7 s · `changes` 0.3 s · `color` 7.0 s · `commit-echo` 13.2 s ·
`commit` 1.7 s · `config` 4.3 s · `confirm` 1.6 s · `conflict` 6.7 s · `cut-tally` 6.4 s · `door-kill` 9.8 s ·
`durability` 0.4 s · `durable-arc` 3.1 s · `exec-host` 0.4 s · `exec-sandbox` 0.2 s · `exectest` 0.2 s ·
`git-aware` 0.4 s · `gitlog` 1.5 s · `greencommit` 2.1 s · `hunk-shape` 4.5 s · `inspect` 2.5 s · `intent`
2.8 s · `log-window` 11.8 s · `agent-pipeline` 8.9 s · `pipes` 3.2 s · `policyaudit` 1.3 s · `policygate`
1.4 s · `porcelain-path` 6.9 s · `prefix` 4.2 s · `reap` 15.1 s (declares `// sweep-budget-ms: 600000`) ·
`reaper-survivor` 9.3 s · `receipts` 4.7 s · `record-window` 12.0 s · `remember` 2.7 s · `report-kill` 3.0 s ·
`report-window` 1.7 s · `role-arc` 3.9 s · `runreceipts` 4.7 s · `scene-tools` 0.5 s · `show` 3.7 s ·
`spawnlog` 2.8 s · `staged` 3.2 s · `streams` 5.1 s · `two-tree` 3.1 s · `verdict` 12.2 s · `window` 4.6 s ·
`world-tools` 0.6 s. The five reds are named, not wired and not hidden: `code-index`'s stale top-5 (v532's
named red); `confession`'s §9 pin — it enumerates the live silent face as two rows, and `record-encoding`'s
declaration (v237, **582 commits ago**) makes it three, so the pin has been red since; `cwd-axis` and
`tree-axis`, the tree-motion witnesses, red because the shared worktree moved under the run (1552 → 1575
files, both digests in the ledger); and `isolated`, whose clean-checkout arm runs `code-index` and reports
that red as a reproducibility finding, which is its job. The census prints **111 = 87 row + 3 helper + 15
swept + 6 tool + 0 deferred · 0 unclassified · rows 84+3**, arms 14/14; `verify:ci-wiring` reads population
**87 = 84 + 3**, five rows declaring their own milliseconds, 0 refused. The full derived set over this
increment's final bytes printed **84/84 green · residue named 3** on the authoring box (2026-10-28), every
new row far inside the 240 000 ms fallback.

**v534 — the forty-eight rows met ubuntu, and six were red.** Run `40693312992` (sha `ea3cabb`, 2026-10-28) was the first to carry the
whole 84-row population onto a Linux runner: **78/84 green**, six reds, each naming a platform fact the proof
had been taking from Windows. `config` and `streams` wrote a helper script without the executable bit — on
POSIX git EXECUTES `diff.external`/`fsmonitor`/hooks, so the shell refused and git exited 128 (Windows ignores
the bit); `streams`' hook ALSO ran `node` under a scrubbed PATH that does not contain `/usr/local/bin`, so its
body is now `printf | tr` (a builtin and a `/usr/bin` tool). `pipes` drove a `node` program through `exec.run`,
which supplies NO env — the policy's `envAllow` filters an empty caller env, so a bare name resolves through
execvp's default `/bin:/usr/bin`: git is there, node is not (`spawn node ENOENT`), and the host refuses an
absolute path BY DESIGN, so the program is now `sh -c` with `printf` builtin on POSIX (`node -e` on Windows).
`door-kill` met a timer race: a 1 ms budget can fire AFTER a fast child finished, `child.kill()` is then a
no-op and the record honestly says `signal: null` beside exit 0 — the row now retries to a real kill (four
attempts), names the late-timer case in its output, and prints the record it graded. `hunk-shape` read
`git log -S` over a depth-1 clone and got `[]` — history is a declared input of the proofs step, so the
workflow now checks out with `fetch-depth: 0`. `reap`'s §5 asserted that an attached child dies with its
parent — true on win32, false on POSIX (measured: 6 → 13 beats), so §5 is a platform branch now, and the
teardown's unconditional `taskkill` became `killTree()` (taskkill on win32, a recorded-pid SIGTERM elsewhere;
on Linux the old call was a spawn error nobody read). Every repair was verified on BOTH planes — this Windows
box and a `node:22` docker plane (git 2.39.5) — before this paragraph was written. The same increment closed
the two sweep reds v533 named: `code-index` now builds its corpus from `git ls-files` on an indexed plane
(567 files, 3 590 chunks on this box) and its second query was re-pinned to the file's own envelope
vocabulary (`serializeApp deserializeApp PersistEnvelope APP_STORAGE_VERSION` → `persist.ts` at #1, 0.617),
with the old tokens recorded beside the pin; `confession`'s §9 pin had been red for 582 commits because
`record-encoding`'s declaration (v237, `2642033`) added a third silent name — the pin is now the measured
three-name face. `isolated` was not re-run this increment: its clean-checkout arm ran `code-index`, so the
repaired code-index is expected to unblock it, and that is a prediction, not a measurement.

**v535 — the last thirteen green swept proofs are rows; the two that remain are a property of the tree.**
The thirteen were re-measured green on this box after v534's repairs (2026-10-28): `asks-axis` 18 s ·
`build-arc` 7 s · `closure` 4 s · `code-index` 7 s · `confession` 63 s · `container` 24 s · `deploy-arc` 3 s ·
`drive-axis` 6 s · `ebusy` 18 s · `isolated` 146 s · `plane-axis` 10 s · `provenance` 53 s · `timeout-axis`
47 s. `isolated` is admitted after reading its own §s: its §2 ACCEPTS a nonzero workspace build only when the
runner names the failing package and quotes a reason from that task's own output (v82), and its v84 note
records that a cross-drive checkout (dest on C:, repository on D:) fails for a path reason that is a fact
about the drive — on a CI runner both live on the same volume, so that reason cannot arise; §2 grades what
the build REPORTS either way (exit 0 with an empty failed list, or a nonzero exit only with a named failing
package and a reason quoted from that task, v82), and the two planes are graded by the same sentences. It declares 900 000 ms in its own header; the
docker trio needs the pre-pulled `node:22-alpine` the workflow already provides, and `timeout-axis` needs
nothing but time (47 s, measured, no marker needed). The census prints **111 = 100 row + 3 helper + 2 swept +
6 tool + 0 deferred · 0 unclassified · rows 97+3**, arms 14/14; `verify:ci-wiring` reads population **100 =
97 + 3**, six rows declaring their own milliseconds, 0 refused. The two that stay SWEPT are `cwd-axis` and
`tree-axis`, and they stay by measurement, not by neglect: their verdict is whether the walked tree MOVED
during a run, so their greenness is a property of a quiet tree — v533's own whole-population sweep reddened
both because other lanes were writing while it ran. A build that shares its worktree with every other lane
would encode that coincidence as a gate, and a gate that reddens when a neighbour commits is not a verdict.

**v539 — the thirteen rows met ubuntu; one was red, and the clause it exposed had never been able to fire.**
Runs `40714702936` (sha `fa53c57`) and `40715800324` (sha `6ed5f6b`) both carried population 101 =
98 run + 3 (the m8 lane's `verify:template-publish` joined in `fa53c57`) and both printed **97/98 green**.
Twelve of the thirteen new rows were green: `asks-axis` 7.5 s · `build-arc` 0.9 s · `closure` 1.1 s ·
`code-index` 5.4 s · `confession` 61.1 s · `container` 6.7 s · `deploy-arc` 0.7 s · `ebusy` 2.5 s ·
`isolated` 134.4 s (its 900 000 ms clean-checkout build, green on the runner's single volume — the wiring
amendment could only predict that) · `plane-axis` 2.6 s · `provenance` 19.4 s · `timeout-axis` 35.9 s.
The thirteenth, `drive-axis`, was RED in 0.4 s both times, with the same sentence: "the POSIX arm must say
the question does not arise instead of claiming a Windows-shaped victory: /tmp/nexus-x on / vs the
repository on / — SAME DRIVE, so relative() can name these paths and a bundler can follow them". The defect
was in the runner: `driveVerdict()` compared `where.repoDrive` — `driveOf()`'s STRING — with `parse('/')`, a
Path OBJECT, so the POSIX clause was unreachable on every host and a single-root box claimed a Windows-shaped
victory; the proof's §4 builds that POSIX pair synthetically and asserts the clause exists, so the wired row
graded exactly the branch the runner could not reach. The comparison is now string-to-string
(`where.repoDrive === '/' && destDrive === '/'`), and the proof needed the mirror repair: its default-arm
assertion expected `/SAME DRIVE/` on every host, so after the runner fix a POSIX host reddened with "the
[isolated] line must state the drive verdict it computed: … POSIX-SINGLE-ROOT" (observed on the node:22
plane); both sites now require `win32Host ? /SAME DRIVE/ : /POSIX-SINGLE-ROOT/`, keeping §4's two absences
(a Windows host must not print the POSIX clause; a POSIX host must not print either Windows word). Verified
after the fix on both planes: win32 `--only drive-axis` **OK 25.1 s**, node:22 docker plane **OK 29.6 s**.
The pre-flight clone's other reds are plane artifacts, each with its green CI counterpart: `provenance` red
because a Windows `git clone` checks out CRLF while `git show` serves LF (CI 19.4 s), and `ebusy` / `isolated`
TIMEOUT on the D: bind mount (240.1 s / 901.1 s against CI's 2.5 s / 134.4 s). The census prints **112 = 101
row + 3 helper + 2 swept + 6 tool + 0 deferred · 0 unclassified · rows 98+3**, arms 14/14; the population
moved 100→101 with no census edit because the m8 row is DERIVED, not declared.

**What the census does NOT claim.** It classifies the 2 still-swept proofs; it does not run them in the build
— the agents sweep stays the human-run channel, with its own budgets (240 000 ms default, 3 600 000 ms
ceiling). The 2, named: `cwd-axis` and `tree-axis`, the tree-motion witnesses, whose verdict is about the
tree the run stood on rather than about the code they grade. v533's forty-eight rows ran on ubuntu for the
first time in `40693312992` (sha `ea3cabb`, 2026-10-28) — **78/84 green, six
platform reds** (`config`, `streams`, `hunk-shape`, `pipes`, `door-kill`, `reap`), each caused by a POSIX fact
the proof had been taking from Windows; v534 repaired all six and verified each on both planes, and the
post-fix verdict arrived as run `40697674971` (sha `604d14e`): **84/84 green of a derived population of 87 ·
residue named: 3**, the six at `config` 0.5 s · `door-kill` 0.9 s · `hunk-shape` 0.4 s · `pipes` 0.4 s ·
`reap` 6.3 s of its declared 600 000 ms · `streams` 1.0 s, the job in 5 m 10 s. Their authored timings
above are this Windows box's, and the CI box has been 2–3× faster on every repo-wide row so far. The
three lane rows have a REAL prerequisite: a docker daemon holding `node:22-alpine`. The workflow pre-pulls it
before the proof step; a human running `verify:proofs` on a docker-less box will see those three redden with
"no such image", which names the missing sandbox rather than the lane. The closure reads `from '…'` and
`import('…')` through the sweep's tokenizer; a bare side-effect `import './x.mjs'` is not read and would
surface as an orphan (a RED), not as a silent helper — no tracked module uses that form at this ref. And a
module on disk that the commit does not own is invisible by design: the population is the INDEX's, because CI
can only run what the commit owns.

### 2026-11-10 — the re-stamp: 129 → 130 tracked modules, HELPER 4 → 5, after the other lane's gate entered the census population

- The module the census could not have seen at the previous section's ref is `docs/evidence/m9/plane-bound-claims.mjs` — the other lane's gate landed as part of `9ab2371` ("a failure names itself everywhere across the edge, the api, and the proof (ADR 0056)"), and the merge `90ccf28` carried it onto this box. The census reads the INDEX, so it went from 129 to 130 the moment that commit existed; the intervention to close the gap was never made until now, and `verify:evidence-census` was exit 1 on this box from the merge onward for exactly two drifts:
  - `the README says 4 HELPER module(s); this census derived 5` — the repaired m9 proofs import the gate's `planeBoundRuleIsLive()`, so the import closure grew by one;
  - `the README says 129 tracked modules; this census read 130 from the index`.
- What moved: the disposition table above — `every one of the **130**` and `| HELPER | **5** |` with `m9/plane-bound-claims.mjs` named in the closure list. Nothing else did: ROW stays **117** (116 run + 1 excluded), SWEPT stays **3**, TOOL stays **5**, DEFERRED stays **0**, and no row, proof, package.json or gate moved by one byte. The recount door's §3 scoreboard reads `exec-host rows 359/13 · measured 359/13`, and the recount proof is exit 0 at this ref. The amendment-witness census (`table-recount-proof` §7) reads `ledger headings 254 · no dangling explicit citations · the newest grant 576 IS titled` — 576's record is 0016's own 2026-11-10 entry, written late on purpose, and this file does not repeat it.
- Measured exits at this ref: `verify:evidence-census` **exit 0** (`... 130 tracked modules close as 117 row + 5 helper + 3 swept + 5 tool + 0 deferred · 0 unclassified · rows 116+1`), `verify:table-recount` **exit 0**, `verify:record-encoding` **exit 0**, `verify:record-window` unchanged. `verify:arms` and `verify:arms-freshness` and `verify:ci-wiring` read the same population as the previous section — this re-stamp moves no clause, no ceiling, no population and mints no amendment (a recount is not an increment).

### 2026-11-11 — the catch-up: 130 → 132 tracked modules, ROW 117 → 119 (two Java proof rows entered the census without this ledger following)

- The two modules that moved the index are `docs/evidence/java/gateway-suite-proof.mjs` and
  `docs/evidence/java/db-index-proof.mjs`, added as `verify:gateway-tests` (`01e2e20`, which wired the
  edge's 22-test suite into the ledger) and `verify:db-index` (`7191e7e`, the EXPLAIN proof that the
  soft-delete queries take an Index Scan). Both are `verify:*` scripts whose whole command is one `node`
  call into `docs/evidence`, so the census derives them as ROW the moment those commits exist. It reads the
  INDEX, not the filesystem: the population went 117 → 119 rows and 130 → 132 tracked modules without
  anyone touching this table, and `verify:evidence-census` was exit 1 from `7191e7e` onward for exactly
  its four honest drifts (`ROW row says 117; derived 119`, the run/residue split twice, and
  `README says 130 tracked; derived 132`).
- What moved: the disposition table above — `every one of the **132**`, `**119 running rows + 0 excluded
  by name**`, and `| ROW | **119** (119 run + 0 excluded) |`. Nothing else did: HELPER stays **5**, SWEPT
  **3**, TOOL **5**, DEFERRED **0** (119 + 5 + 3 + 5 + 0 = 132), no row was removed or excluded, and no
  proof, gate, roster or `package.json` byte moved. This is a recount, not an increment: it mints no
  amendment and the arms roster stays **132** (the "132 fixture arms" number on the table is arms, not
  modules — unchanged).
- The queue slice being landed alongside this (`v661`, ADR 0066) adds NO `docs/evidence` row: its proofs
  are ordinary vitest files under `apps/web/test/` (real Redis on 56379, real Postgres, and the opt-in
  switch), which the census does not enumerate. Its only effect on this ledger is that the catch-up was
  noticed and repaired here rather than left red for the next lane to inherit.
- Measured exits at this ref: `verify:evidence-census` **exit 0** (`132 tracked modules close as 119 row
  + 5 helper + 3 swept + 5 tool + 0 deferred · 0 unclassified · rows 119+0 · arms 132/132 MATCHED`),
  `verify:ci-wiring` **exit 0** (population **119 closes as 119 + 0**, 0 orphaned tsc leg, every Maven
  module built).

### 2026-11-12 -- the catch-up: 132 -> 134 tracked modules (two DS evidence arms entered the census undecided) -- TOOL 5 -> 7

- The two modules that moved the index are `docs/evidence/ds/complexity-arms.mjs` (`b9d6578`, v671
  ADR 0104) and `docs/evidence/ds/single-map-ab.mjs` (`f437c22`, v672 ADR 0105): the mutation arms for
  the DS complexity contract and the same-process interleaved A/B harness behind the TtlLru single-Map
  verdict. Neither is a `verify:*` row (the Studio CI proofs battery is census-derived and may not widen
  its steps), neither is imported by any derived row, and they do not end in `-proof.mjs` (so the sweep
  does not claim them) -- the pre-fix census classifies both as `UNCLASSIFIED`, graded one assert before
  the README-drift assert this entry also repairs.
- What moved: the disposition table above -- `every one of the **134**`, `| TOOL | **7** |` now naming
  the two DS arms in its how-decided list, and two `ROSTER` entries added to
  `docs/evidence/ci/evidence-census-proof.mjs` declaring both as `class: 'tool'` with commands a reader
  can re-run and falsifiable reasons. Nothing else: ROW stays **119** (119 run + 0 excluded), HELPER
  stays **5** (both ds arms import only Node builtins, so the import closure is unchanged), SWEPT
  stays **3**, DEFERRED stays **0** (119 + 5 + 3 + 7 + 0 = 134). No row, package.json byte, arms roster or
  workflow moved -- the "132 fixture arms" number on the table is arms, unchanged.
- The sibling gate `verify:record-encoding` was RED at this ref for one ISLAND line: a `countError` call
  whose argument is four CJK characters inside `apps/web/src/server/cache/discoverInvalidation.ts`
  (line 297 at HEAD, digest `13552d988ada245f`, shipped with v670 at `eb138f8`, ADR 0102). One of those
  four characters is a render the writer model produces, so only three witnesses remain -- below
  `WITNESS_FLOOR` -- and the line is an island of Chinese inside an English record; the pin for that
  digest (image codepoint `36335`, `REJECTED flanks cjk|punct`) was appended to `LOOKALIKE`. The
  uncommitted v674 lane work in that file carries a byte-identical line (working-tree line 426) and is
  covered by the same pin; it was left untouched by this recount.
- This entry is a recount, not an increment: no amendment, no arms, no ceiling moved.
- Measured exits at this ref: `verify:evidence-census` **exit 0** (`134 tracked modules close as 119 row
  + 5 helper + 3 swept + 7 tool + 0 deferred . 0 unclassified . rows 119+0 . arms 132/132 MATCHED`),
  `verify:record-encoding` **exit 0**, `verify:arms-freshness` unchanged.
