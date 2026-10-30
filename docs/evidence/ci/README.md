# The CI WIRING — a red proof that fails nothing

This directory exists because the wiring is a subject. `.github/workflows/ci.yml` is the repository's only
workflow, and until amendment 514 it ran `typecheck`, `lint`, `test` and `build` and **no `verify:*` step at
all** — so a proof could go red, stay red for hundreds of commits, and cost the build nothing. That is not a
footnote to the evidence tree; it is the reason the evidence tree can rot.

## The wiring that makes a red proof fail the build is itself graded (M0/v528 — ADR 0016 amendment 514)

```
npm run verify:proofs      # the build's own row: run every derived proof row, exit 1 on any RED
npm run verify:ci-wiring   # the gate over the wiring itself (and a row inside the set it enumerates)
node docs/evidence/ci/ci-wiring-arms.mjs   # 40 witness arms, by hand — see below why it is not a row
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
- **Bounds.** The regenerated numbers are Windows counts from this box, and the platform witness is now measured: run `40928766201` reads `verify:package-counts docs/evidence/studio/package-counts-proof.mjs [declared 600000ms] ... OK 69.0s` — ubuntu answered the win32-generated block exactly on all seven rows. Before the run, the scan had found no test in the seven packages branching on `process.platform` for its COUNT (the only conditional is three-runtime's `distSync` skip, which needs a missing `dist/` and CI builds one); the run is the measurement, the scan is only why it was expected. §1a reads tracked changes **plus untracked files** under the package roots; ignored build output (`dist/`, `node_modules/`) does not refuse, which is why the clean worktree could generate the block it did. And a table regenerated at HEAD goes stale the moment another lane commits test cases — that is the row's design: the next build refuses, now names the package, and asks for `--write`.

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
- **Bounds.** The row's first hosted contact is the next CI run and is not claimed here: it needs a Chrome the candidate list can find (the list ends at `google-chrome`), a Docker daemon holding the pre-pulled `pgvector/pgvector:pg16`, and a JDK 25 + Maven on `PATH`. The row adds ~11-12 minutes to the proofs step here; the previous full job was 13 m 49 s (`40997877121`), and the job's 60-minute ceiling is unchanged. A TIMEOUT kill is a SIGKILL, so the harness's `finally` cannot run and its container survives — but leak-sweep's owner-gone rule retires it at the next run's §1a, and that rule is a row of this same build. The two helpers stay under `tools/harness/` because the census claims modules under `docs/evidence`, and machinery is not a proof. The harness starts a DEV server by design (v194: the route reads `NEXUS_API_URL` at request time), so this row grades the source the Studio serves, not the production build `npm run build` produced.

### v554 — the row's first ubuntu contact answered green: `OK 363.1s` inside its 1 800 000 ms declaration, `104/104`, and a job that read 20 m 32 s of the 60-minute ceiling (ADR 0016 amendment 535)

- **The contact v553 deferred.** Run `41000350370` (sha `4ca1280`, 2026-10-30) carried row 104 to ubuntu for the first time. The row answered on the first attempt: `verify:publish-e2e     docs/evidence/m7/studio-publish.mjs [declared 1800000ms] ... OK 363.1s`, and the population line read `104/104 green of a derived population of 104 · residue named: 0`. No repair was needed between the wiring and this contact.
- **The job's shape.** Job 03:59:22Z → 04:19:54Z = **20 m 32 s**; proofs step 04:01:50 → 04:19:49 = **17 m 59 s**. All twelve steps above the proofs were green, so the four prerequisites v553 named were met by the workflow's own steps rather than assumed: the docker pre-pull (pgvector + `node:22-alpine`) took 10 s, the Maven warm-up 16 s, and the harness found its Chrome through the candidate list's PATH fallback.
- **What the row costs.** 363.1 s on the hosted runner against 672.6 s locally (a Windows box also running the arms) — 6 m 3 s of the proofs step, 33.7% of it, and the largest single row in the population (next: `verify:mutation OK 200.8s`, `verify:isolated OK 145.5s`, `verify:package-counts OK 67.6s`). Without it the step would have read ~11 m 56 s, within a minute of v552's 11 m 21 s at 103 rows. It is the first row whose proof starts four long-lived servers to grade one button.
- **The ceiling's first real reading.** 20 m 32 s of 60 minutes is 2.9× headroom — the first measurement of what the population actually costs with a live-stack row inside it, rather than what it may cost. §11's rule (ceiling strictly below the rows' worst-case sum, now ~8.5 h at 104 rows) is unchanged; the ceiling remains the tighter bound.
- **What this green does NOT say.** The runner prints a row's output only when it reddens, so the hosted verdict is exit-based: `OK` means the harness exited 0. The `440/440` count is the local measurement of the same bytes at amendment 533, not a number the hosted log printed. A verbose channel that surfaces a green row's own last line is not claimed here. One green contact is one sample, not a no-flake guarantee, and the 2.9× headroom is a fact about this runner, not a promise about a slower one.

### What this does NOT claim

Deriving the population has a limit listing does not have to admit: a module under `docs/evidence` that was
never turned into a `verify:*` script stays invisible to the build. Amendments 516–519 closed that half:
the census below gives every one of the **116** tracked modules a disposition, and the derived population is
**104 running rows + 0 excluded by name** at this ref (v532 triaged the swept population and wired sixteen
Node-only proofs; v533 ran the sweep over all 81 and wired the forty-eight green dist+spawn proofs). And no
gate here can make GitHub run: it reads bytes
committed in this repository, and whether the workflow executes on `master` is knowable only from the real
runs — it ran red (`40603544099`, amendment 515's four exec-host cases on ubuntu), then green four times
(`40659064493` with 12 rows, `40662063095` with 17, `40664659344` with 20, `40682580110` with 36), then red
again on the first run that carried all 84 rows (`40693312992`: 78/84 green, six platform reds, repaired at
v534 — the row-by-row account is below), which is the evidence this section was waiting for.

## The evidence census — every tracked module is a row, a helper, a swept proof, a tool, or a deferral (amendment 516 at M0/v530; amendment 517 at v531 wired the three lane proofs; amendment 518 at v532 wired sixteen swept proofs; amendment 519 at v533 wired forty-eight more; amendment 520 at v534 repaired the six ubuntu reds that population's first full run found; amendment 521 at v535 wired the last thirteen green swept proofs; amendment 522 at v539 repaired the one ubuntu red those thirteen's first contact exposed — a POSIX clause that could never fire; amendment 525 at v542 added the arms-receipt row and its helper; amendment 526 at v543 checks this table's five class counts, its run/residue split and both prose numbers against the census's own derivation, and reddens on drift)

```
npm run verify:evidence-census   # a row inside the population it counts
```

Every tracked module under `docs/evidence` now has a disposition, and the build re-derives all of them:

| class | count at this ref | how it is decided |
| --- | --- | --- |
| ROW | **104** (104 run + 0 excluded) | a `verify:*` script whose whole command is one `node` call into `docs/evidence` — proof-set's own `PROOF_COMMAND`, imported, never retyped |
| HELPER | **4** | import closure from every `verify:*` node target and every declared tool, through `sweep.relativeSpecs` (code position only): `agents/sweep.mjs`, `lib/syncproc.mjs`, `m9/wire-fields.mjs`, `ci/arms-receipt.mjs` |
| SWEPT | **2** | the agents sweep's own population, read by CALLING `sweep.trackedProofs('HEAD')` — at this ref only `cwd-axis` and `tree-axis`, the tree-motion witnesses, which stay there by measurement (their verdict is about whether the walked tree moved during the run) |
| TOOL | **6** | declared in the proof's `ROSTER` with a reason and a command a reader can re-run (two mutation probes, two arms scripts, the isolated-build arms, the SVG generator) |
| DEFERRED | **0** | none at this ref — the three Studio lane proofs v530 deferred are ROWS since v531 (the workflow pre-pulls `node:22-alpine`, their one blocker). The class and its refusals stay for the next proof a sandbox really blocks |

Anything else is `UNCLASSIFIED` and exits 1 naming the file. Stale records are refused too: a roster entry the
commit no longer owns, a declaration shadowing a derived class, a reason a reader cannot falsify, a row target
the commit does not own, an import of a file the commit does not own, an exclusion that retires no row. **20
fixture arms** prove each refusal on a synthetic plane — the fourteen above plus six that drift one README
number each; the prose-import arm proves the tokenizer is the sweep's, not a byte regex.

Four rows that needed nothing but Node walked through the door in the same increment:

| row | proof | measured on the authoring box (2026-10-28) |
| --- | --- | --- |
| `verify:audit-contract` | `m9/audit-contract-proof.mjs` | 4.2 s — reads the service's Java record and the client model, then asks the TypeScript compiler |
| `verify:record-encoding` | `agents/record-encoding-proof.mjs` | 4.4 s — the record corpus's encoding census (120 000 ms own budget) |
| `verify:pipeline` | `studio/pipeline-proof.mjs` | 0.7 s — prompt → design-model ops → layout → undo/redo → AI diff |
| `verify:table-recount` | `agents/table-recount-proof.mjs` | 38.2 s — boots vitest and reconciles this directory's README table (300 000 ms own budget) |

Two of them (`record-encoding`, `table-recount`) are ALSO in the agents sweep's population; the census prints
that overlap every run — double coverage, not a conflict.

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
MATCHED**. The four new rows' ubuntu verdict arrived with run `40662063095` (the 17-row population's first
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

**v534 — the forty-eight rows met ubuntu, and six were red.** Run `40693312992` was the first to carry the
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
first time in `40693312992` — **78/84 green, six
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
