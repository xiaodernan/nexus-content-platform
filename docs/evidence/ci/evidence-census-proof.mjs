// NEXUS M0 v530 (docs/evidence/ci) — THE EVIDENCE CENSUS: every tracked module under docs/evidence is a row, a helper, a swept proof, a declared tool, or a DEFERRED row whose blocker is named (ADR 0016 amendment 516).
//
// Why this exists, stated the way §60 requires: amendment 514 wired the derived proof rows into CI and then
// named the hole its rule cannot see — "a module under docs/evidence that was never turned into a verify:*
// script is invisible to the build", measured there as 109 tracked modules against 15 rows. Amendment 513's
// stale needle sat red for 465 commits because nothing graded it; a module that no door names is the same
// failure one step earlier: it is not even a proof nobody runs, it is a file nobody has DECIDED about. This
// census is that decision, made explicit and re-derived on every build.
//
// The population is the COMMIT's, not the filesystem's: `git ls-files -- docs/evidence` filtered to runnable
// modules. A file on disk that the commit does not own cannot run in a checkout, so counting it would grade a
// tree CI never sees. The classes are derived wherever derivation is possible:
//
//   ROW        a `verify:*` script whose whole command is one `node` call into docs/evidence (proof-set's own
//              PROOF_COMMAND, imported — not restated). Includes the rows EXCLUDED by name, which are printed.
//   HELPER     reachable by the imports a root's bytes REALLY make (sweep.relativeSpecs — code position only),
//              followed evidence-to-evidence from every verify:* node target and every declared tool.
//   SWEPT      in the agents sweep's own population, read by calling sweep.trackedProofs — the human-run
//              channel is named, not guessed from a filename shape.
//   TOOL       declared in ROSTER below: human-run by construction (a mutation probe edits the tree under
//              test; an arms script fires real processes), with the command a reader can re-run.
//   DEFERRED   declared with the exact sandbox prerequisite that keeps it out of the build and the repair
//              that would wire it. Printed every run; a deferral that stops being printed has stopped existing.
//
// Anything else is UNCLASSIFIED and this proof exits 1 naming the file. A declaration that shadows a derived
// class, a roster entry the commit no longer owns, a reason a human cannot falsify, a row target the commit
// does not own, or an import of a file the commit does not own is a RED too: each is a stale record, and a
// stale record is how this directory grew 95 invisible modules in the first place.
//
// A tree with no `.git` cannot answer which modules the commit owns, so this census REFUSES on such a plane
// instead of guessing from the filesystem (amendment 130 measured that cost: a row that asks the repository
// dies at `git ls-tree … → exit 128`, and the archive plane's "42 reds" were one question answered 42 times).
// The closure's own bound: it reads the import forms this corpus writes — `from '…'` and `import('…')` — through
// the sweep's code-position tokenizer (amendment 89). A bare side-effect `import './x.mjs'` is NOT read; such a
// module would surface as an orphan (a RED), never as a silent helper. No tracked module uses that form today.
//
// v531 (amendment 517) — the three Studio lane proofs v530 DEFERRED are derivable ROWS now: the workflow
// pre-pulls `node:22-alpine` (the one blocker all three named) and `verify:build-lane`, `verify:container-lane`
// and `verify:deploy-lane` exist, so the census derives them and their deferral entries are deleted.
//
// v532 (amendment 518) — the 79 swept proofs were TRIAGED, not wired wholesale: comments stripped, then
// scanned for a service reach (ci-wiring §6), a child spawn, and a shipped-build import. The 17 that import
// a dist and start no child of their own were measured; 16 joined the build as rows and one stayed swept as
// a NAMED red (code-index: its top-5 expectation no longer holds on the grown corpus — measured, not
// guessed, and recorded in the amendment). The census now prints 39 row + 63 swept, and a swept proof that
// is red on this box is a sentence in the ledger rather than an unopened door.
//
// v533 (amendment 519) — the sweep was aimed at ITSELF as the triage instrument: one whole run over HEAD
// 28a8930's 81 tracked proofs returned 76 OK / 5 FAIL / 0 TIMEOUT, and the forty-eight OK rows that import a
// shipped dist and start only git/node were wired. The five reds are named in the ledger and stay swept:
// code-index's stale top-5; confession's §9 pin stale since v237 (582 commits, a third silent-face row);
// cwd-axis and tree-axis, tree-motion witnesses red because the shared tree moved mid-run; isolated, which
// inherits code-index by running it on a clean checkout. The census now prints 87 row + 15 swept.
//
// v534 (amendment 520) — the forty-eight rows met ubuntu (run 40693312992): 78/84 green, and the six reds were
// platform facts the proofs had been taking from Windows — POSIX executable bits on helpers, a scrubbed PATH
// that has no /usr/local/bin, exec.run's empty env, a 1 ms timer racing a fast child, a depth-1 clone, and an
// attached child that survives on POSIX. All six repaired and verified on both planes; the checkout now takes
// fetch-depth 0 because history is a declared input. The post-fix verdict arrived green: run 40697674971
// (604d14e) printed 84/84 of a population of 87. The two sweep reds above (code-index, confession) are
// repaired too and STAY SWEPT until v535 wires them, so this census's counts are unchanged: 87 row + 15 swept.
//
// v535 (amendment 521) — the last thirteen green swept proofs are ROWS: asks-axis, build-arc, closure,
// code-index, confession, container, deploy-arc, drive-axis, ebusy, isolated, plane-axis, provenance,
// timeout-axis. Each was re-measured green on the authoring box after v534's repairs; isolated is admitted
// because its own §2 accepts a nonzero workspace build only when the runner names the failing package AND
// quotes a reason from that task (v82) — its cross-drive failure here is a fact about C: vs D:, and a CI
// runner puts dest and repo on one volume, where that reason cannot arise (the build's verdict there is the
// next run's, and §2 grades it either way). The census
// now prints 100 row + 2 swept, and the two stayed by measurement: cwd-axis and tree-axis are tree-motion
// witnesses whose verdict is a property of a quiet tree, and a build worktree is never quiet.
//
// v539 (amendment 522) — the thirteen rows met ubuntu: twelve green, and drive-axis RED because its POSIX
// clause could never fire (driveVerdict compared a STRING with a Path object, so a single-root host printed
// the Windows sentence; one line now compares strings, and the proof branches its default-arm expectation on
// the same platform fact). Both planes green after the repair. The population is 101 row + 2 swept here, not
// because this census changed: another lane's verify:template-publish landed in fa53c57 and the ROW class
// DERIVED it — a new verify:* script is a row the day the commit owns it.
//
// v540 (amendment 523) — the CI job gained its own envelope (a 60-minute ceiling strictly below the rows' own
// worst case, and a read-only token), and the arms that grade the wiring were re-run for the first time since
// v531: four had gone stale under the table that quoted them (one crashed at load, one aimed at a population
// that had moved, one could be killed by box load, and the mixed-EOL guard refused every CRLF carrier). None
// of it moves a census class; this note is here so the header's chronology keeps a record of the increment.
//
// v542 (amendment 525) — the arming tool writes a receipt of the seven subjects and the derived population it
// graded, and `verify:arms-freshness` is the row that refuses when any of them has moved. That ROW and its
// import `ci/arms-receipt.mjs` are the count's only change (102 row + 4 helper + 2 swept + 6 tool = 114): both
// are DERIVED — the row from its verify:* script, the helper from the import closure — so this census did not
// learn a filename, it re-read the tree.
//
// v543 (amendment 526) — this file's own README restated its numbers by hand, and two of them had drifted by
// v542 (the arms roster still read 35 after v540 measured 40, and the "at this ref" sentence still carried
// v533's 111 modules / 84 rows). The census now recomputes the table's five class counts, its run/residue
// split, and the two prose numbers, and reddens when any of them disagrees. The shapes are graded exactly: a
// table this reader cannot parse is a red asking for the edit, never a silent skip.
//
// v547 (amendment 530) — the LAST EXCLUDED row retired, so the ROW class is 103 running rows and the residue
// is empty; the print loop above had nothing to print for residue, and the two derived cells moved by one row
// each (102 run + 1 excluded → 103 run + 0 excluded). No class count moved: 115 tracked = 103 row + 4 helper
// + 2 swept + 6 tool. The 20 fixture arms never depended on the real set — they build their own plane with an
// excluded row — so the proof that retires exclusions is not weakened by having none.
//
// v607 (this increment; the ADR 0016 section is owed, and the ledger files sit in another lane's uncommitted set,
// so this header carries the record until that section exists) - THE MANIFEST'S BLIND SIDE. This census answers
// "does every evidence module have a channel?" and its population was `git ls-files -- docs/evidence`, which says
// nothing about the mirror question: does every `verify:*` NAME have one? Measured at v607's ref: the manifest held
// 125 verify:* scripts, PROOF_COMMAND admitted 116, and the 9 it dropped were doors the build never walked - seven
// real-browser proofs under tools/harness (each one imports the CDP launcher and six of them navigate a Studio on
// 127.0.0.1:3210 that no workflow step starts), the maven suite (the workflow runs its own `mvn ... test` line
// rather than the script), and `verify:proofs` itself (the door the proofs step calls). Nothing DECIDED those
// nine, and an author who adds a tenth undispositioned `verify:*` script today adds a promise no census grades. So
// MANIFEST below gives every non-row `verify:*` script one of three dispositions, each read out of bytes rather
// than out of the entry's own prose:
//   RUNNER     the workflow's run lines contain `npm run <name>` - the door CI actually walks.
//   COVERED    the manifest command and one workflow run line name the same tool AND the same tracked subject path,
//              read after comment lines are dropped: `cache-dependency-path: services/nexus-api/pom.xml` and a
//              comment that quotes the mvn line are both prose about a pom, not a test run.
//   DEFERRED   nothing in CI runs it. It must name a module its OWN CODE imports - through the sweep's tokenizer,
//              so a path quoted in a header comment buys nothing - plus the measurement, the blocker and the next
//              repair, the same three-field discipline a deferred evidence MODULE already answers to.
// Anything else is UNDISPOSITIONED and this census exits 1 naming the script. A stale entry (a disposition whose
// script is gone), a duplicate, an entry shadowing a derived row, a target the index does not own, a runner whose
// workflow step vanished and a deferral whose reach sits only in comments all redden too; eleven fixture arms aim
// at exactly those, on a synthetic plane, so the refusals are measured rather than read off this paragraph.
//
// v608 (this increment; the ADR 0016 section is still owed for v606-v608 and the ledger files sit in another lane's
// uncommitted set, so this header keeps the record) - THE REVERSE BLIND SIDE. v607 asked which NAMES exist. It said
// nothing about which RUNNABLE MODULES the build walks, and that question has a different population: `git ls-files
// -- tools` held 16 runnable modules at v608's ref. One was the runner the proofs step calls; four were imported by a
// module the live closure reaches (125 modules were live, and the closure walks them through the sweep's tokenizer);
// seven were the node targets of the seven deferred harness doors; and FOUR were in no class at all —
// tools/ci/record-encoding-repair.mjs, the 367-line repairer that fixed the record corpus, and the three dock
// drivers tools/harness/studio-build.mjs (106 lines, amendment 174), studio-container.mjs (94, amendment 172) and
// studio-deploy.mjs (130, amendment 177). No script names those four, no module IMPORTS them, and nothing in this
// repository mentions them outside their own headers: 697 lines of working code with no decision recorded against
// them, which is amendment 516's founding complaint one directory over. So TOOLS_STANDBY below disposes each with
// the fact, the blocker and the next repair, and any fifth module that rises into no derived class reddens the
// build exactly as an undispositioned script name does:
//   RUNNER   the node target of the manifest entry the workflow's run lines call — this census stands behind that door.
//   REACHED  a live module imports it: the closure starts at the derived rows, the runner target and the declared
//            tools, so a helper of a helper of a row is reached and nothing about it has to be written down.
//   NAMED    the node target of a `verify:*` NAME that MANIFEST disposes — its reason lives in that entry, so the
//            two censuses interlock instead of each keeping its own excuse.
//   BEHIND   a deferred door imports it and nothing the build walks does. A real state (a door v607 deferred keeps
//            its own helpers) and a DERIVED one: printed every run, never declared, so a deferral cannot grow by
//            prose — and an island of dead modules that import one another stays UNREACHED, because nothing anchors it.
//   STANDBY  declared, and only valid when nothing derives it: the entry must name either a module whose bytes hold
//            its path as a CODE-POSITION STRING (the dynamic-import case — a grader reaches its tool through
//            `await import(pathToFileURL(join(root, TOOL)))`, which no specifier reader can see), or a derived ROW
//            that replaced it. A comment quoting the path buys nothing; a replacement that is not a row buys nothing.
// Anything else is UNREACHED and this census exits 1 naming the module. Twelve fixture arms aim at exactly those, on
// the same synthetic plane as the thirty-one that came before, and the bounds are named rather than hidden: the
// closure reads
// only `from '…'` and `import('…')` specifiers, so a row that SPAWNS `node tools/x.mjs` is invisible to it (which is
// why the repairer is a STANDBY with a reachedBy rather than an accusation), a bare side-effect `import './x.mjs'`
// is still not read, and a live module that imports an UNtracked path outside docs/evidence is not reddened here —
// `helperClosure` grades the dangling edges the census can see, and ci-wiring grades the workflow.
//
// v609 (this increment; the ADR 0016 section is still owed for v606-v609 and the ledger files sit in another lane's
// uncommitted set, so this header keeps the record) - A MEASUREMENT NOBODY CAN RE-READ IS A SENTENCE. v607 and v608
// together wrote eleven deferrals, and each states its evidence as prose with numbers in it: "684 lines", "a Studio
// served on 127.0.0.1:3210". Nothing re-read those numbers, which is exactly the rot v543 killed in the README by
// recomputing its cells — and the grade found one already stale as this line was written: the container driver
// reads 95 lines to a reader that counts its unterminated last line, and v608's own entry said 94. So gradeMeasured
// below runs on every declarable deferral in the file — MANIFEST's deferred entries against the module their script
// calls, TOOLS_STANDBY against the module it stands down, and the evidence ROSTER's deferred entries against their
// own file — and grades two families of claim against those bytes:
//   N LINES     must equal the census's own count of the module the entry NAMES (not of any module it mentions: the
//               arm that claims the launcher's line count instead of its door's is red), counting the last line even
//               when it carries no terminating newline, because that is the line a reader sees.
//   127.0.0.1:P must appear in those bytes, because the address is the prerequisite the deferral is blaming; a
//               comment that mentions it counts, and a module that never says it does not.
// A measured field with NEITHER kind of claim is refused too — "it is slow" cannot be re-derived, so it cannot be
// re-checked either — and a module the entry blames that the commit owns but this box cannot read is named rather
// than skipped, because a claim nobody can open is the silence this file exists to break. Seven fixture arms aim at
// these refusals, one per declaration site and one per family, and what the rule still cannot see is named: a
// duration, a count of checks or a hosted run number is prose ABOUT a measurement rather than a re-derivation of
// one, so only the two families above are graded. The bytes graded are the ones `read` returns — the worktree here,
// a fresh checkout in CI — which is what makes a drift a red for the person who caused it rather than a note later.
//
// v610 (this increment; the ADR 0016 section is still owed for v606-v610 and the ledger files sit in another lane's
// uncommitted set, so this header keeps the record) - THE COPY OF THIS FILE'S OWN PRINTOUT IS GRADED TOO. The README
// restates the arms roster in prose — a headline of the shape `**N fixture arms**`, then one number per family — and v543 established that
// a number a human copies off a console line drifts, yet that repair stopped at the census's class table and left
// this sentence unchecked. armsRoster counts the roster from the arm NAMES (one family per name prefix, in the order
// the arms first appear, so adding an arm without saying so moves a number by itself) and readmeArmsDrift reads the
// sentence by grammar rather than by position: the headline shape `**N fixture arms**`, then the breakdown in which
// every family must appear as "<number word> above" or "<number word> that …" in the order the list defines, bounded
// by the prose-import clause that closes the sentence. Eight refusals follow it: a headline the list no longer
// matches, a breakdown that no longer adds up to its own headline, a family number out of date (named by family, and
// saying plainly when two were merely swapped), a family dropped or a family claimed twice, a state that is not a
// number word this reader parses, a headline written in a shape nothing reads, a breakdown sentence reshaped away,
// and a breakdown whose closing bound has moved. Eight arms aim at them, X1 through X8. The bound is named rather
// than hidden: any other "<word> that" inside the region is taken for a family claim and refused as an unparseable
// number, because the reader cannot tell a count from a sentence — the red asks for the edit rather than guessing.
//
// v611 (this increment; the ADR 0016 section is still owed for v606-v611 and the ledger files sit in another lane's
// uncommitted set, so this header keeps the record) - THE COPY INSIDE THIS FILE IS GRADED LIKE THE ONE OUTSIDE IT.
// v610 gave the README's arms sentence a reader, and the header above is the same kind of text: paragraphs quoting
// "thirty-one that came before" and "50/50 MATCHED" that were true the day they were written. History keeps its
// numbers — v533's eighty-one is a fact about v533 — so the claim that must not drift gets a MARKED line rather
// than a sentence, and sourceRosterDrift parses only that shape:
//   ROSTER <n> arms in <k> families — <label><count> · …      (one line, the roster in full)
// Six refusals became eight as the marker's own arithmetic got readers: the line absent, the line reshaped, a
// headline the list no longer matches, a family count that is not what the list says, a pair list whose length is
// not the family count, a pair that is not a label plus a count, pairs whose sum is not the headline, and a family
// whose pair names the wrong number. Seven arms aim at them, S1 → S7, on the same synthetic plane, where the fixture
// header states the SAME list the real one does — the arms are one list, so a marker here and a marker there are
// read by the same function. The bound is named: this line keys on this file's own arm names and nothing else. The
// census's other counts — tracked modules, rows, the tools population — move under a shared working tree the moment
// another lane wires a script, and a marker keyed to them would redden this row for work nobody asked it to review;
// the README already carries those numbers, and they are the repository's to update.
//
// v624 (this increment; the label was v612 until this lane read its own history — amendment 555 is v612, written
// by another lane while this one was in flight, and v613 to v623 went the same way, so a second v612 would have
// been two records answering to one name. The ADR 0016 section is still owed for this lane's v606-v611 and for
// this increment, and the ledger files sit in another lane's uncommitted set, so this header keeps the record) -
// THE ARMS LIST IS GRADED BY THE CENSUS IT ARMS. v610 and v611
// put readers on the two COPIES of the roster; the list itself still answered for nothing. An arm is a name, a patch
// and a check, and until now nothing said what the check must catch: an arm whose check asserts a sentence no
// refusal authors is an arm that passes on a plane where nothing was proved. So refusalSites indexes every
// `violations.push` in this file by the function that says it and the order it says it in, taking the literal text
// of the message with its `${…}` holes cut out, and armCoverage asks one question per refusal: which arm's own run
// produced a violation that text matches? Seven answers follow — a push this reader cannot close, a refusal no arm
// reaches that no row declares, a declaration naming a site this file does not author, a duplicate declaration, a
// declaration without a falsifiable reason or without the arm it owes, a declaration whose site an arm now reaches,
// and an arm whose produced text no site authors. The grader runs on a fixture plane of its own (a synthetic proof
// with three refusations, two arms that reach them and one declaration), because the arms are on the plane they
// grade: pointing the real list at the real file would make every arm a witness for itself. UNARMED is the debt
// table for a refusal no arm reaches, and v624 emptied it. Thirty-eight arms landed with this paragraph: eight that
// grade the coverage grader itself, eighteen that pay the debt each declared row carried, and twelve for refusations
// the index found that no row had ever claimed — and the closure refusals turn out to be reachable after all,
// because the census counts a LISTING, so a path arriving twice from git closes at seven over a population of eight.
// A roster this long writes its family counts as compounds, so the README's number reader learned them: twenty-four
// parses, and fifty-odd is still refused rather than skipped. The count prints every run — refusations authored,
// reached, declared, unaccounted — and the assert refuses the last.
//
// v625 (this increment; the ADR 0016 section is still owed for this lane's v606-v611, for v624 and for this one,
// and the ledger files sit in another lane's uncommitted set, so this header keeps the record) — THE DURATIONS
// THIS FILE PUBLISHES ARE DATED AGAINST THE BYTES THEY BLAME. v543 put a reader on the README's class table, v609
// on a deferral's numbers, v610 and v611 on the roster in its two copies and v624 on the arms list itself; the
// number-set left unpublished to any reader was this file's OWN table of durations — four rows under one headline
// date, 2026-10-28, over three files the repository had committed since. A timing is a measurement of bytes, so it
// ages exactly the way a count does, and the headline was the shape that hid the aging: one day over four files is
// a day nobody is ever asked to move. `authoringTableDrift` walks the table by grammar. The header states three
// columns and carries no date; every row names a row this census runs and THE file that row runs (the short
// `m9/audit-contract-proof.mjs` form names a path no `verify:*` command contains), states a duration the reader
// parses and an ISO day; that day may not postdate the day this census runs on, and may not precede the last
// commit touching that file — read from `git log -1 --format='%ct %h' -- <path>`, so a row that outran its own
// bytes is named with the ref that overtook it. Fourteen refusals, armed by fourteen arms D1 to D14 on the same
// synthetic plane, where D2 rewrites the fixture header into the exact shape that went stale here. Two bounds,
// named: the table is a CLAIM SET, not a census of times — a row absent from it is nobody's lie, and this box
// holds a measured duration for four rows, not for the rest of the build; and the comparison is by local calendar
// DAY rather than by instant, so a commit landing the same day a human measured passes, because the run may have
// started before the sentence was written. The day is spelled from getFullYear/getMonth/getDate rather than
// `toLocaleDateString('en-CA')`: an ICU-less Node renders that as `en-US`, and a M/D/YYYY string cannot be ordered
// against a YYYY-MM-DD one.
// v626 (this increment; the ADR 0016 section is still owed for this lane's v606-v611, for v624, for v625 and for
// this one, and the ledger files sit in another lane's uncommitted set, so this header keeps the record) - THE
// COMMITS A HOSTED CLAIM NAMES ARE RE-DERIVED, NOT RESTATED. v609 bounded a hosted run number as prose ABOUT a
// measurement and the bound held for the log: a clone cannot replay a runner's stdout. It can answer for the
// commit that stdout ran on, so where a hosted sentence names the commit its run tested, that half of the bound lifts
// and the reader grades it; a run number with no address in its paragraph stays prose, out of reach. The counts are
// PRINTED on every run rather than copied into a sentence: addresses held, distinct commits they resolve to,
// populations re-derived and claims that stated no address before them. `hostedClaimDrift` reads each claim out of its PARAGRAPH (the file wraps, so an
// address and the population the same run printed sit lines apart, and a line-reader would grade one and skip the
// other), resolves `sha `x`` against HEAD's history, re-derives the population from the package.json committed AT
// that ref, and dates the run written in the parentheses around the address against that commit's own UTC day.
// Measured as this landed: sixteen addresses over fourteen distinct commits, every one resolving to exactly one
// commit on this history; eight of them dated and every one dated the day its commit landed; nine population
// claims stated after an address, all nine agreeing; six more stating no address before them, which are this box's
// own `--only` selections and are printed rather than guessed at. Ten refusals, armed by ten arms E1 to E10 on the
// same synthetic plane. Three bounds, named rather than left to the reader: the green FRACTION is not graded,
// because a selection run answers `1/1 green of a derived population of 103` and the one counts the rows a person
// asked for, not the population; a claim at a ref where derivePopulation itself has since changed is DECLINED and
// printed, because it was true of the rules of its own time and no number read today can call it a lie; and the
// clock here is UTC on both sides, unlike the authoring-box table above, which the box's own calendar dates —
// the runner stamps its start in UTC, and so does a commit.
// v630 (landed as 4c9a022; the ADR 0016 section is still owed for this lane's v606-v611, for v624, v625, v626,
// v630 and this one, and the ledger files sit in another lane's uncommitted set, so this header keeps the record)
// — EVERY
// RUN NUMBER THIS FILE WRITES NAMES THE COMMIT ITS RUN TESTED. v626 wrote, in its own bounds, that a run number
// with no address in its paragraph stays prose. Measured against HEAD before this line was written, the file held
// twenty-three distinct run numbers: nine of them named no commit anywhere in the file, and two more
// (`40928766201` at v550's account, `41421600776` at v568's) carried an address only three sections away, which is
// a copy rather than a claim about the sentence that printed the number. Fourteen MENTIONS sat in a paragraph that
// named no ref, and the reader v630 asks is per PARAGRAPH. The nine were read off the host — `gh run view <id>
// --json headSha,createdAt`, read-only — and every one answered for itself: one commit on this history per
// abbreviation, each landing the same UTC day its run was stamped. So the bound lifts where the file can meet it,
// and eleven edits carry the addresses now: a paragraph that writes the same number twice needs the address once,
// because the refusal is about the number in the paragraph. `hostedClaimDrift` refuses a number whose paragraph
// names no ref. Measured as this landed: thirty addresses over twenty-three distinct commits, every one resolving
// to exactly one commit on this history; twenty-three populations re-derived at their own refs with none declined;
// fifteen dated claims, every one dated the day its commit landed; twenty-three run numbers over eighteen
// paragraphs with none bare; and the same six `--only` selections still stating no address before them, printed as
// before. Two arms, F1 (a bare number appended) and F2 (the address struck off the number that already had one),
// take the roster to 126 arms in 11 families. Four bounds, named rather than left to the reader: an ADDRESS with
// no number beside it stays legal, because a verdict may be recorded by ref alone; a date is graded only when the
// paragraph states one, and seven of the fourteen new anchors carry none (HEAD dated eight of its sixteen, this
// ref dates fifteen of its thirty), because a dense run list reads as a list and a date on every entry would be
// noise; the census grades a claim's CONSISTENCY with the ref, not the host's identity, since "this run tested
// this commit" is read off `gh` by a person and what this clone can answer is that the commit's own bytes do not
// contradict it; and a nine-to-twelve-digit number inside backticks is taken for a run id whether or not it is
// one — every number in that shape this file writes is a run, and the day a different one lands, the red asks
// for a word beside it rather than guessing which numbers are evidence.
// Two facts the block owes the record, both measured rather than remembered. The label this cycle was written
// under was taken while these bytes were in progress (`9ed6194` claims v627), so the increment landed as v630;
// the four derived cells the worktree README carries are the m9 lane's re-pin, and — checked in a clean
// worktree at HEAD with this file and a README holding those cells handed back to HEAD — this commit reddens
// on exactly the two drifts HEAD already reddens on (`the README says 2 SWEPT module(s); this census derived 3`;
// `the README says 126 tracked modules; this census read 128 from the index`) and on the one module nobody has
// decided about (`docs/evidence/m9/audit-contract-arms.mjs`), which no cell of this file can decide. Carrying
// the cells would have added a third red this commit cannot answer for, because the row wiring they describe
// is not in it.
// v631 (this increment) — AN ADDRESS IS WHAT THIS CLONE RESOLVES, NOT THE WORD IN FRONT OF IT. v630's bound was
// that a paragraph naming no ref keeps its run number out of reach, and the file it grades had been naming refs
// anyway in the one shape a reader cannot mistake: a hex token between backticks with the word sha left off.
// Measured against HEAD before this line was written, the graded file held nine distinct tokens of that shape;
// eight resolve to exactly one commit on this history and one — `b4fa34d49cd20e2e`, the Maven digest v547's row
// prints — resolves to nothing, so no cat-file is spent on it and no sentence is refused for it. None resolves
// to two or more here, and none does across the eight other evidence READMEs the sight reads. Reading the eight
// as addresses took HEAD's file from thirty spelled claims over twenty-three commits to thirty-nine over the same
// twenty-three: the shape named commits this record already had, not new ones. What the bytes shipped here print
// is forty addresses over twenty-three commits, nine of them bare, twenty-three populations re-derived with none
// declined, fifteen dated claims, six UNOWNED population prints, and twenty-three run numbers over eighteen
// paragraphs with none bare.
// The rule is narrower than the sight, and a false red drew the line. The v553 bullet measured a worktree cut
// from sha `03279a2` plus the change it was wiring: that build reported 104 rows while the commit itself derives
// 103. A base is not a build, and grading a bare token's population refused a sentence for a thing the sentence
// never claimed, so the rule splits — a bare address ANCHORS (it satisfies v630's requirement that the
// paragraph name a commit, and it enters the run-vs-two-commits identity map) and it receives NEITHER population
// NOR date grading, which stay attached to the last spelled address in their paragraph or print as UNOWNED. One
// refusal is new, and it is the failure mode the bare shape invites: a token two commits in this clone share,
// written beside a run number or a population, is red. Five arms carry it — G1 strikes the word sha off a
// hosted claim and asserts it stays anchored with its numbers ungraded, G2 anchors a run on a bare address this
// history does not carry and asserts the census still calls it unanchored, G3 writes the shared abbreviation,
// G4 writes a token that resolves to nothing and asserts the refusal names the missing address rather than the
// token, G5 spells one commit and cites another for the same run — taking the roster to 131 arms in 12
// families. Three bounds, named rather than left to the reader: a bare token counts as an address only where
// exactly one commit resolves AND that commit is on this history, so a shallow clone declines it the way v626
// declines a moved derivation; the shape test asks for a letter, because this file writes its twenty-three run
// ids as backticked digits and a token with no letter in it cannot be told from one of those; and the sight
// over the other eight READMEs prints instead of refusing, because those bytes belong to the lanes
// that wrote them — the counts stand as what a lane owes if it asks for its own README to be graded.
// ROSTER 132 arms in 12 families — A19 · R10 · M25 · T17 · N7 · X8 · S7 · C8 · D14 · E10 · F2 · G5
//
// v647 (this increment; the ADR 0016 section is still owed for this lane's v606-v631, and the lint ledger sits in
// this same uncommitted set, so this header keeps the record) - A RUNNER'S CARRIER IS THE STEP THAT WALKS IT. The
// manifest census had one `runner`, so the sentence printed under it — "the workflow's proofs step calls" — was
// true by accident: the only door disposed as a runner WAS the proofs step's. Declaring `verify:lint-tree` the
// second runner would have printed that same sentence about a file the proofs step never calls, and a print that
// attributes a door to the wrong step is a sentence about the wiring the wiring does not say. So runLinesOf below
// keeps the step name beside each run command, the display reads the pair, and the pair is GRADED and not merely
// printed: manifestOf returns `runnerSteps`, and arm M25 rewrites the fixture proofs step's call into a block
// scalar, then asserts the door is still attributed to "Evidence proofs", still appears in `commands`, and still
// passes the runner check. Reshaping it is what found the bug in the pairing itself — the census's own print said
// `verify:proofs` ran in step "Docker images (pre-pull for the lane proofs)", and reading that print was the
// evidence. A `- name:` line that closes a block scalar was tested AFTER the block-exit branch, so the step named
// above a block kept ownership of every command written below it; the order is now close the block, capture the
// name, match the `run:`. `runCommandsOf` went with it, because the pairing left it without a caller and the
// coverage comparison wants the same list projected to bare strings. The ownership refusal moved off the same
// false carrier: a runner whose target the index does not own is refused as "disposed as a runner", not as "the
// runner the proofs step calls". The roster carries the new arm in every copy of its number — the marker above,
// the fixture README sentence the census grades inside itself, the live README headline, and the arms that grade
// those numbers — so 131 becomes 132 in twelve families. Measured at this ref, and printed by this run every time:
// the manifest holds 127 `verify:*` names closing as 117 derived rows + 2 runner + 1 covered + 7 deferred + 0
// undispositioned over 16 run commands the workflow executes, and the tools population is 17 modules closing as 2
// runner + 4 reached + 7 named + 0 behind + 4 standby + 0 unreached over a live closure of 132. What the guard is
// worth was measured rather than argued: with the new workflow step deleted from the worktree — nothing else
// touched — this census exits 1 naming `verify:lint-tree`, and the ci.yml bytes restored from the index are
// identical to what they were.
//
// Run from the repository root:  node docs/evidence/ci/evidence-census-proof.mjs   (or: npm run verify:evidence-census)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sweep from '../agents/sweep.mjs';
import { derivePopulation, EXCLUDED, splitSet, unknownExclusions } from '../../../tools/ci/proof-set.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HERE = 'docs/evidence/ci/evidence-census-proof.mjs';
const README_FILE = 'docs/evidence/ci/README.md';
const EVIDENCE = 'docs/evidence/';
const SWEEP_DIR = 'docs/evidence/agents/';
const TOOLS_DIR = 'tools/';
/** The extensions a checkout can RUN. A new one is admitted by this census the day it appears, as unclassified. */
export const MODULE_RE = /\.(mjs|cjs|js|mts|cts|ts)$/;
const RUN_RE = /^node +(\S+\.(?:mjs|cjs|js|mts|cts|ts))$/;
const RUN_HEAD_RE = /^node +(\S+\.(?:mjs|cjs|js|mts|cts|ts))\b/;

/**
 * The modules a human runs on purpose, and the three the build cannot run yet — each with the reason, such
 * that a reader can falsify it. `tool` rows are run by a person; `deferred` rows are runnable but blocked on a
 * sandbox prerequisite stated in their own entry. The census prints every one of them on every run.
 */
export const ROSTER = [
  {
    file: 'docs/evidence/agents/isolated-arms.mjs',
    class: 'tool',
    run: 'node docs/evidence/agents/isolated-arms.mjs',
    why: 'two clean-room BUILD verdicts (513 s and 522 s per arm, measured 2026-09-28) — each arm is a full `npm run build` of a fresh checkout, so no sweep row or build row can afford it; the committed script is the only way a reader can re-measure amendment 84\'s numbers',
  },
  {
    file: 'docs/evidence/agents/reaper-plane-arms.mjs',
    class: 'tool',
    run: 'node docs/evidence/agents/reaper-plane-arms.mjs',
    why: 'v529\'s 16-cell witness over the compiled tree-reaper rule, run against a FAKE plane in child processes; it deliberately skips the one cell that would issue a real `taskkill` against an invented pid, so it is a human-run measurement, never a build row',
  },
  {
    file: 'docs/evidence/agents/amendment129-probe.mjs',
    class: 'tool',
    run: 'node docs/evidence/agents/amendment129-probe.mjs',
    why: 'amendment 129\'s mutation probe: it rewrites the runtime source in place and runs a whole vitest suite per mutation; a build row that edits the tree the build is grading is not a verdict, so it stays a committed, human-run reproduction of the debt',
  },
  {
    file: 'docs/evidence/studio/emit-svg.mjs',
    class: 'tool',
    run: "node docs/evidence/studio/emit-svg.mjs 'an analytics dashboard'",
    why: 'a GENERATOR, not a claim: it writes the committed SVG artifacts under docs/evidence/studio/ from the design model; running it in CI would rewrite evidence bytes, so a person runs it when the artifact is regenerated',
  },
  {
    file: 'docs/evidence/studio/style-override-probe.mjs',
    class: 'tool',
    run: 'node docs/evidence/studio/style-override-probe.mjs',
    why: 'ADR 0015\'s mutation probe: six arms each mutate one line of the style-override path and run the smallest suite that can see it, restoring every file in `finally`; a build row that edits the tree under test is not a verdict, so the arm log lives in its own header',
  },
  // v531 — the three Studio lane proofs that were DEFERRED here are now derivable ROWS: `verify:build-lane`,
  // `verify:container-lane` and `verify:deploy-lane` exist in package.json and the workflow pre-pulls
  // `node:22-alpine`, which was the blocker all three named. Their entries are deleted, not reworded: a
  // deferral that outlives its blocker is the stale record this census refuses in the other direction.
];

const WORKFLOW_FILE = '.github/workflows/ci.yml';

/**
 * The manifest's other half: every `verify:*` script the admission rule does NOT turn into a row, disposed by
 * class. A disposition may not shadow a derived class (a script that IS a row must not be declared here), and a
 * class may not be a feeling: `runner` and `covered` are checked against the workflow's own run lines, `deferred`
 * against an import the blamed file really makes. The three fields a deferral owes are the module census's own
 * discipline, so one grammar covers both directions of the same question.
 */
export const MANIFEST = [
  {
    name: 'verify:proofs',
    class: 'runner',
    run: 'npm run verify:proofs',
    why: 'the door the proofs step walks: its command is the derived runner, whose population this census reads, so the workflow calling this name is checkable in the workflow bytes rather than quoted from here',
  },
  {
    name: 'verify:lint-tree',
    class: 'runner',
    run: 'npm run verify:lint-tree',
    why: 'the second door the build walks directly: `Lint the whole tree against the debt ledger` calls this name, and its target is a tool, not a proof row — it grades ESLint verdicts over every tracked source file outside the areas it excuses by name against docs/evidence/ci/lint-debt.json, and the admission rule cannot DERIVE it because the command does not sit under docs/evidence',
  },
  {
    name: 'verify:api-tests',
    class: 'covered',
    run: 'npm run verify:api-tests',
    tool: 'mvn',
    subject: 'services/nexus-api/pom.xml',
    why: 'the service suite DOES run in CI, just not through this name: the workflow owns its own mvn line, so the disposition is a coverage claim the gate can falsify by reading both command strings',
  },
  {
    name: 'verify:harness',
    class: 'deferred',
    run: 'npm run verify:harness',
    reach: 'tools/harness/cdp.mjs',
    measured: '87 lines; the only one of the seven harness doors that navigates no served URL - it launches Chrome through the CDP pipe and asks the page what it can really see',
    blocker: 'a Chrome binary the workflow never installs: cdp.mjs resolves one from Windows paths and a `google-chrome` PATH lookup, and no step in ci.yml pins or installs a browser the way it pins Node 24 and JDK 25',
    next: 'import it from a proof under docs/evidence the way docs/evidence/studio/png-baseline-proof.mjs imports tools/harness/png.mjs, and pin a browser step in the workflow; the day both exist PROOF_COMMAND derives the row with no edit to this census',
    why: 'the harness self-test is a claim about the harness, and a build that cannot launch the browser it grades cannot hear the claim',
  },
  {
    name: 'verify:studio',
    class: 'deferred',
    run: 'npm run verify:studio',
    reach: 'tools/harness/cdp.mjs',
    measured: '270 lines; navigates 127.0.0.1:3210 and compares a PNG baseline through tools/harness/png.mjs; starts nothing itself (no createServer, no spawn in its own bytes)',
    blocker: 'a Studio served on 127.0.0.1:3210 by a person who ran `npm run dev` first - the proofs step owns no long-lived dev server, and one would hold the 60-minute job ceiling for every row behind it',
    next: 'stand up its own Studio the way docs/evidence/m7/studio-publish.mjs does (amendment 534 moved that proof into docs/evidence for exactly this reason), then it becomes a derived row',
    why: 'the golden-path walk is real-browser evidence, and real-browser evidence with an unstalled prerequisite is a script a person runs, not a door the build walks',
  },
  {
    name: 'verify:scene',
    class: 'deferred',
    run: 'npm run verify:scene',
    reach: 'tools/harness/cdp.mjs',
    measured: '684 lines; navigates 127.0.0.1:3210; the largest of the seven and the one whose WebGL question a headless runner cannot answer without a pinned browser',
    blocker: 'a served Studio on 127.0.0.1:3210 and a Chrome that can paint a 3D scene; the workflow installs neither the server nor the browser',
    next: 'stand up its own Studio the way docs/evidence/m7/studio-publish.mjs does (amendment 534), then move it under docs/evidence so PROOF_COMMAND derives it',
    why: 'a 3D surface proof that assumes somebody else started the app is a verdict about the authoring box, and this census refuses to call that a channel',
  },
  {
    name: 'verify:world',
    class: 'deferred',
    run: 'npm run verify:world',
    reach: 'tools/harness/cdp.mjs',
    measured: '350 lines; navigates 127.0.0.1:3210 and writes its own screenshots beside the run',
    blocker: 'a served Studio on 127.0.0.1:3210 plus a Chrome binary; no workflow step provides either',
    next: 'stand up its own Studio the way docs/evidence/m7/studio-publish.mjs does (amendment 534), then move it under docs/evidence so PROOF_COMMAND derives it',
    why: 'the world surface is graded in a viewport, and a viewport nobody launches is not a build prerequisite - it is a person at a desk',
  },
  {
    name: 'verify:assets',
    class: 'deferred',
    run: 'npm run verify:assets',
    reach: 'tools/harness/cdp.mjs',
    measured: '473 lines; navigates 127.0.0.1:3210; the asset panel it grades is built by `npm run build`, which the proofs step does run, so its only missing prerequisite is the served app',
    blocker: 'a served Studio on 127.0.0.1:3210 and a Chrome binary, neither of which the workflow provides for the proofs step',
    next: 'stand up its own Studio the way docs/evidence/m7/studio-publish.mjs does (amendment 534), then move it under docs/evidence so PROOF_COMMAND derives it',
    why: 'an asset-surface walk that reads a URL it never started is a claim about a machine the build does not own',
  },
  {
    name: 'verify:account',
    class: 'deferred',
    run: 'npm run verify:account',
    reach: 'tools/harness/cdp.mjs',
    measured: '159 lines; navigates 127.0.0.1:3210 and waits on the #nexus-canvas selector',
    blocker: 'a served Studio on 127.0.0.1:3210 plus a Chrome binary; the account face also needs the service it reads credits from, which this probe assumes rather than starts',
    next: 'stand up its own Studio and service the way docs/evidence/m7/studio-publish.mjs does (amendment 534), then move it under docs/evidence so PROOF_COMMAND derives it',
    why: 'the M7 account face was written as a probe beside the others, and a probe that assumes a server is a human-run measurement until it owns one',
  },
  {
    name: 'verify:credits-surface',
    class: 'deferred',
    run: 'npm run verify:credits-surface',
    reach: 'tools/harness/cdp.mjs',
    measured: '664 lines; navigates 127.0.0.1:3210; the largest surface proof of the M8 credits lane',
    blocker: 'a served Studio on 127.0.0.1:3210 and a Chrome binary; its screenshots land in docs/evidence/studio/, so a build run would rewrite evidence bytes it is also grading',
    next: 'stand up its own Studio the way docs/evidence/m7/studio-publish.mjs does (amendment 534), write its captures to a scratch plane instead of the graded tree, then move it under docs/evidence so PROOF_COMMAND derives it',
    why: 'a proof that writes into the tree it grades is the rot this census names elsewhere, so its capture path is part of the repair, not a footnote to it',
  },
];

/**
 * Every command the workflow executes, PAIRED with the step whose `run:` holds it. Deliberately narrower than
 * ci-wiring's step reader: this census asks one question - does some command CI executes name this subject - so
 * it takes run lines (inline and block scalar), drops comment lines, and claims nothing about ordering or
 * swallow-checking, both of which docs/evidence/ci/ci-wiring-proof.mjs grades. A shape this reader cannot parse
 * yields NO command, which reddens a coverage claim rather than quietly satisfying it. The step name is kept
 * because a door's carrier is the STEP, not the job: two `verify:*` scripts can be called by two different
 * steps, and a print that attributes both to one of them is a sentence about the wiring that the wiring does not say.
 * The block closes BEFORE a step line is read, because the line that ends a block scalar is the next step's
 * `- name:`; pairing the command after it with the step above the block attributes a door to a step that never calls it.
 */
export function runLinesOf(workflow) {
  const out = [];
  let inBlock = false;
  let keyIndent = 0;
  let step = null;
  for (const raw of String(workflow).split(/\r?\n/)) {
    if (/^\s*#/.test(raw)) continue;
    const indent = (raw.match(/^\s*/) || [''])[0].length;
    if (inBlock) {
      if (raw.trim() === '') continue;
      if (indent > keyIndent) {
        out.push({ step, run: raw.trim() });
        continue;
      }
      inBlock = false;
    }
    const named = /^\s*-\s+name:\s*(.*)$/.exec(raw);
    if (named) {
      step = named[1].trim().replace(/^['"]|['"]$/g, '');
      continue;
    }
    const m = /^(\s*)run:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const value = m[2].trim();
    if (value === '|' || value === '>' || value === '|-' || value === '>-') {
      inBlock = true;
      keyIndent = m[1].length;
    } else if (value !== '') out.push({ step, run: value });
  }
  return out;
}

/** The three dispositions a non-row `verify:*` script may hold, plus the refusal for everything else. */
export const MANIFEST_CLASSES = ['runner', 'covered', 'deferred'];

/** How many lines a reader sees when they open the file. */
export const lineCount = (text) => String(text ?? '').replace(/\n$/, '').split('\n').length;

/** The two families of claim a `measured` field can state in a form another run can re-derive from bytes. */
export function measuredClaims(measured) {
  const src = String(measured ?? '');
  return {
    lines: [...src.matchAll(/(\d+)\s+lines?\b/g)].map((m) => Number(m[1])),
    ports: [...src.matchAll(/127\.0\.0\.1:(\d+)/g)].map((m) => m[0]),
  };
}

/**
 * Grade the numbers a declared deferral states against the bytes of the module that entry NAMES (v609).
 *
 * `wc -l` counts terminators, so a file whose last line carries none reads one shorter than the eye; this counts
 * the line a reader sees, which is the number a person can reproduce by opening the file. Both families are
 * graded against the SAME module the entry blames, and that is the whole point: a true count of some module the
 * entry merely mentions is a sentence about a different file. A field stating neither kind of claim is refused —
 * "it is slow" cannot be re-derived, so nothing can ever prove it stopped being true — and a blamed module the
 * commit owns but this box cannot read is named rather than skipped, because a claim nobody can open is the
 * silence this file exists to break. An UNtracked path is skipped on purpose: the caller already reddens it, and
 * a second red for the same missing file is noise that drowns the refusal a reader would act on.
 */
export function gradeMeasured({ who, modulePath, measured, isTracked, read }) {
  const violations = [];
  if (!isTracked) return violations;
  const bytes = read?.(modulePath);
  if (typeof bytes !== 'string') {
    violations.push(`${who} states numbers about ${modulePath}, which the commit owns but this box cannot read — the claim is unfalsifiable here, so it is refused here`);
    return violations;
  }
  const claims = measuredClaims(measured);
  if (claims.lines.length === 0 && claims.ports.length === 0) {
    violations.push(`${who}'s measured field states no line count and no served address (${JSON.stringify(measured)}) — a measurement nobody can re-read from the bytes is a sentence, not a disposition`);
    return violations;
  }
  const own = lineCount(bytes);
  for (const n of claims.lines) {
    if (n !== own) violations.push(`${who} claims ${modulePath} reads ${n} line(s); this census counts ${own} in its bytes — the number graded is the one for the module this entry blames, not one it mentions (if ${n} is true of another file, say which in prose)`);
  }
  for (const a of claims.ports) {
    if (!bytes.includes(a)) violations.push(`${who} claims ${modulePath} asks for ${a}; that address is not in its bytes — the prerequisite a deferral blames has to be the one the module really reaches for`);
  }
  return violations;
}

/**
 * The manifest census: a pure function over (all scripts, the whole index, a reader, the workflow text and the
 * MANIFEST declarations), returning the dispositions and the violations. Like `censusOf`, it decides nothing about
 * the evidence tree's classes - it reads the same `derivePopulation` the build runs, so a script the runner would
 * walk is a row here too and never a disposition.
 */
export function manifestOf({ scripts, index, read, workflow, manifest = [] }) {
  const violations = [];
  const names = Object.keys(scripts ?? {}).filter((n) => n.startsWith('verify:'));
  const rows = new Set(derivePopulation(scripts).map((r) => r.name));
  const indexSet = new Set(index ?? []);
  const lines = typeof workflow === 'string' ? runLinesOf(workflow) : null;
  const commands = lines === null ? null : lines.map((l) => l.run);
  if (commands === null) {
    violations.push('no workflow text was supplied, so not one `verify:*` disposition can be checked against what CI really runs - an unchecked claim is the silence this census exists to break');
  } else if (commands.length === 0) {
    violations.push(`the workflow reader found 0 run commands in ${WORKFLOW_FILE} - a reader that sees no commands cannot certify that any script is covered`);
  }

  const byName = new Map();
  const coverage = new Map();
  const runnerSteps = new Map();
  for (const e of manifest) {
    if (byName.has(e.name)) violations.push(`MANIFEST disposes ${e.name} twice - two dispositions for one script name is two answers to one question`);
    byName.set(e.name, e);
  }
  for (const [name, e] of byName) {
    const cmd = String(scripts?.[name] ?? '');
    if (cmd === '') violations.push(`MANIFEST disposes ${name}, which the manifest no longer holds - a disposition outlives its script exactly as long as nobody checks`);
    if (rows.has(name)) violations.push(`MANIFEST disposes ${name} as ${e.class}, but PROOF_COMMAND DERIVES it as a row - a declaration cannot shadow a derived class`);
    if (!MANIFEST_CLASSES.includes(e.class)) violations.push(`${name} is disposed with the class ${JSON.stringify(e.class)} — only ${MANIFEST_CLASSES.join(', ')} are declarable; row is DERIVED`);
    if (String(e.run ?? '') !== `npm run ${name}`) violations.push(`${name}'s run line is ${JSON.stringify(e.run)}, not \`npm run ${name}\` — a disposition must name the door a reader can actually walk`);
    if (String(e.why ?? '').length < 40) violations.push(`${name} is disposed without a reason a reader can falsify (${JSON.stringify(e.why)})`);
    if (!cmd) continue;

    if (e.class === 'runner') {
      const target = RUN_RE.exec(cmd.trim())?.[1];
      if (!target) violations.push(`${name} is disposed as the runner, yet its command ${JSON.stringify(cmd)} is not one node call — a door the workflow walks must be one command`);
      else {
        if (!indexSet.has(target)) violations.push(`${name} is disposed as a runner, but the commit does not own ${target} — CI would check out a manifest naming a file no clone holds`);
        if (target.startsWith(EVIDENCE)) violations.push(`${name} is disposed as the runner while its target ${target} sits under ${EVIDENCE} — that command is a derived row, not a door`);
      }
      if (commands && !commands.includes(`npm run ${name}`)) violations.push(`${name} is disposed as the runner, but no run line in ${WORKFLOW_FILE} calls \`npm run ${name}\` — the workflow stopped walking the door this census is standing in`);
      const caller = lines?.find((l) => l.run === `npm run ${name}`);
      runnerSteps.set(name, caller?.step ?? null);
    }

    if (e.class === 'covered') {
      const subject = String(e.subject ?? '');
      const tool = String(e.tool ?? '');
      if (!subject) violations.push(`${name} is disposed as covered without naming the subject path the workflow must also name`);
      if (!tool) violations.push(`${name} is disposed as covered without naming the tool the workflow must also run`);
      if (subject && !indexSet.has(subject)) violations.push(`${name} claims coverage of ${subject}, which the commit does not own — a path no clone holds cannot be a test CI runs`);
      if (subject && !cmd.includes(subject)) violations.push(`${name}'s own command ${JSON.stringify(cmd)} does not name the subject ${subject} it claims to share with the workflow`);
      if (commands && subject && tool) {
        const hit = commands.filter((c) => c.includes(subject)).filter((c) => new RegExp(`(^|\\s)${tool}(\\s|$)`).test(c));
        if (hit.length === 0) violations.push(`${name} is disposed as covered by a workflow command that runs \`${tool}\` against ${subject}, and no run line in ${WORKFLOW_FILE} does — a comment or a \`cache-dependency-path:\` key quoting that path is prose about a file, not a test run`);
        else coverage.set(name, hit);
      }
    }

    if (e.class === 'deferred') {
      const target = RUN_RE.exec(cmd.trim())?.[1];
      if (!target) violations.push(`${name} is disposed as deferred, yet its command ${JSON.stringify(cmd)} is not one node call — a deferral blames a prerequisite of a file, so it must name one`);
      else {
        if (!indexSet.has(target)) violations.push(`${name} defers on ${target}, which the commit does not own — a door that exists only on the authoring box is not a disposition, it is a rumour`);
        const reach = String(e.reach ?? '');
        if (!reach) violations.push(`${name} is deferred without naming the module its own code imports as the prerequisite — a deferral needs a dependency, not a sentence`);
        else {
          const edges = importsOf(target, read).map((p) => p.replace(/\\/g, '/'));
          if (!edges.includes(reach)) {
            const inProse = String(read?.(target) ?? '').includes(reach);
            violations.push(`${name} is deferred on the reach ${reach}, but ${target} does not IMPORT it outside its comments${inProse ? ' — the only place the path appears is prose, and prose is not a dependency' : ''} — so this deferral excuses a script the build could run`);
          }
        }
      }
      for (const [field, bound] of [['measured', 40], ['blocker', 40], ['next', 40]]) {
        if (String(e[field] ?? '').length < bound) violations.push(`${name} is deferred without a ${field} of at least ${bound} characters (${JSON.stringify(e[field])}) — a deferral that stops being measured is a permanent exclusion wearing a new word`);
      }
      violations.push(...gradeMeasured({
        who: `${name} (deferred)`,
        modulePath: target,
        measured: e.measured,
        isTracked: target !== undefined && indexSet.has(target),
        read,
      }));
    }
  }

  const undispositioned = names.filter((n) => !rows.has(n) && !byName.has(n));
  for (const n of undispositioned) {
    violations.push(`the manifest script ${n} (${JSON.stringify(String(scripts[n]))}) is UNDISPOSITIONED: PROOF_COMMAND does not admit it as a row and MANIFEST says nothing about it. Say one of ${MANIFEST_CLASSES.join(' | ')} — RUNNER (the workflow calls \`npm run ${n}\`), COVERED (a workflow run line names the same tool and subject path), DEFERRED (its code really imports the module it blames, and it states measured, blocker and next) — or wire it so the rule admits it`);
  }

  const tally = { runner: 0, covered: 0, deferred: 0 };
  for (const [n, e] of byName) if (!rows.has(n) && names.includes(n) && MANIFEST_CLASSES.includes(e.class)) tally[e.class]++;
  const counts = { names: names.length, row: rows.size, runner: tally.runner, covered: tally.covered, deferred: tally.deferred, undispositioned: undispositioned.length };
  const closed = counts.row + counts.runner + counts.covered + counts.deferred + counts.undispositioned;
  if (closed !== counts.names) violations.push(`the manifest closes at ${closed} over ${counts.names} verify:* names — a script in no class is a promise nobody decided how to keep`);

  return { counts, dispositions: [...byName.entries()].map(([n, e]) => ({ name: n, ...e })), undispositioned, commands, coverage, runnerSteps, violations };
}

/** Every `verify:*` command that is one `node` call, whatever it targets — import-closure roots, not rows. */
export function rootsOf(scripts) {
  return Object.entries(scripts)
    .filter(([name]) => name.startsWith('verify:'))
    .map(([name, cmd]) => {
      const m = String(cmd).trim().match(RUN_RE);
      return m ? { name, file: m[1] } : null;
    })
    .filter(Boolean);
}

/** The relative specifiers a module's CODE imports — through the sweep's tokenizer, not a byte regex. */
export function importsOf(file, read) {
  const text = read(file);
  if (text === null || text === undefined) return [];
  return sweep.relativeSpecs(text).map((spec) => sweep.resolveRelative(file, spec));
}

/**
 * The import closure over the evidence tree. Roots are not helpers — they are the things that run — and the
 * walk follows only evidence-to-evidence edges: a path that leaves docs/evidence and comes back is outside
 * what this reader claims, and would surface as an unclassified module rather than being silently trusted.
 */
export function helperClosure({ roots, tracked, read }) {
  const trackedSet = new Set(tracked);
  const helpers = new Set();
  const dangling = [];
  const queue = [];
  const follow = (fromName) => {
    for (const target of importsOf(fromName, read)) {
      if (!target.startsWith(EVIDENCE) || !MODULE_RE.test(target)) continue;
      if (!trackedSet.has(target)) {
        dangling.push(`${fromName} imports ${target}`);
        continue;
      }
      if (!helpers.has(target) && !queue.includes(target)) queue.push(target);
    }
  };
  for (const r of roots) follow(r.file);
  while (queue.length) {
    const f = queue.shift();
    if (helpers.has(f)) continue;
    helpers.add(f);
    follow(f);
  }
  return { helpers, dangling };
}

/** The five dispositions a runnable module under tools/ may hold; everything else is UNREACHED and red. */
export const TOOLS_CLASSES = ['runner', 'reached', 'named', 'behind', 'standby'];

/**
 * The modules nothing reaches, each with the fact a reader can re-measure, the prerequisite that keeps it out of
 * the build, the repair that retires the entry, and the WITNESS the refusal checks: either a module whose code
 * really holds this path as a string value, or a derived row that grades the same face. v608's own claim is that
 * these four are the whole list — a fifth module in no derived class reddens the build rather than being added
 * here quietly.
 */
export const TOOLS_STANDBY = [
  {
    path: 'tools/ci/record-encoding-repair.mjs',
    reachedBy: 'docs/evidence/agents/record-repair-proof.mjs',
    measured: '367 lines read off the index at this ref; its grader holds the path in `const TOOL = ...`, reaches it with `await import(pathToFileURL(join(root, TOOL)))` and spawns it three times (two --write, one --plan)',
    blocker: 'the grader is SWEPT, not a row: no verify:* script names docs/evidence/agents/record-repair-proof.mjs, so nothing the build walks reaches this tool through it and the repair runs only when a person runs the agents sweep',
    next: 'name the grader a row — verify:record-repair = node docs/evidence/agents/record-repair-proof.mjs, in the package.json the m9 lane holds uncommitted — and give the grader a relative import of this path, which DERIVES the tool as reached and deletes this entry',
    why: 'this repairer is the derived machinery for a whole defect class (a writer channel that mangles records), so an unreached file here is a fix nobody can prove still runs',
  },
  {
    path: 'tools/harness/studio-build.mjs',
    replacedBy: 'docs/evidence/studio/build-lane-proof.mjs',
    measured: '106 lines; its own code imports ./cdp.mjs, navigates the URL_BASE default 127.0.0.1:3211 and drives five checks of the dock BUILD face (probe lands, Allow-once walks the arc, per-step lines, ledger entry, console silence)',
    blocker: 'a real Chrome plus a Studio served on 127.0.0.1:3211 and a real docker daemon — the same prerequisites the seven deferred harness doors name, and no workflow step installs a browser or starts a dev server',
    next: 'the amendment-534 route: a proof under docs/evidence that stands up its own Studio and spawns this driver, which DERIVES it as reached and deletes this entry — or delete the driver once build-lane-proof is shown to cover every face it drove',
    why: 'a driver no script names and no module imports is either the next real-browser row or dead weight, and this census refuses to guess which one it is',
  },
  {
    path: 'tools/harness/studio-container.mjs',
    replacedBy: 'docs/evidence/studio/container-lane-proof.mjs',
    measured: '95 lines (its last carries no terminating newline, and this count is the one a reader sees); its own code imports ./cdp.mjs, navigates the URL_BASE default 127.0.0.1:3211 and drives four checks of the dock CONTAINER face (daemon version with the pinned image, the self-check ask, the container.exec ledger entry, console silence)',
    blocker: 'a real Chrome, a Studio served on 127.0.0.1:3211 and a docker daemon the runner does not have: the workflow pre-pulls node:22-alpine for the build rows but starts no browser and no dev server',
    next: 'the amendment-534 route: stand up its own Studio and docker the way docs/evidence/m7/studio-publish.mjs does and spawn this driver from that proof, which DERIVES it as reached and deletes this entry',
    why: 'the container face is the one the shipped dock asks a human to allow, and a driver that grades it from outside the build is a measurement nobody re-runs',
  },
  {
    path: 'tools/harness/studio-deploy.mjs',
    replacedBy: 'docs/evidence/studio/deploy-lane-proof.mjs',
    measured: '130 lines; its own code imports ./cdp.mjs, navigates the URL_BASE default 127.0.0.1:3211 and drives six checks of the dock DEPLOY face, including the records read back newest-first after the walk',
    blocker: 'a real Chrome, a Studio served on 127.0.0.1:3211 and a docker daemon, plus the deployment records file the walk writes — none of which a workflow step stands up before the proofs step runs',
    next: 'the amendment-534 route: a proof under docs/evidence that owns its own Studio, daemon and records path and spawns this driver, which DERIVES it as reached and deletes this entry',
    why: 'deploy is the arc that writes product state, so its real-browser witness is exactly the kind of door a census must not leave undecided',
  },
];

/**
 * Every string body a module holds at CODE position — comments skipped, template `${ … }` re-entered as code,
 * and a `/` treated as a regex literal only where one can syntactically open. Used for ONE claim: that a grader
 * carries a tool's path as a VALUE rather than in a sentence. A mis-read pattern can only ever lose a literal or
 * invent a token that is not the exact path, and the check demands an exact match, so the direction of failure is
 * a red that asks for the edit rather than a green that was never earned.
 */
export function codeLiterals(text) {
  const src = String(text ?? '');
  const out = [];
  let lastSig = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '/' && '[({,;:=!?&|+-*%^~<>'.includes(lastSig)) {
      const end = regexEnd(src, i);
      if (end > 0) {
        lastSig = '/';
        i = end;
        continue;
      }
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      i++;
      let body = '';
      let interp = '';
      while (i < src.length) {
        if (src[i] === '\\') {
          if (src[i + 1] !== '\n') body += src[i + 1];
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        if (quote === '`' && src[i] === '$' && src[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            else interp += src[i];
            i++;
          }
          continue;
        }
        body += src[i];
        i++;
      }
      out.push(body);
      for (const nested of codeLiterals(interp)) out.push(nested);
      lastSig = quote;
      continue;
    }
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }
  return out;
}

/** One regex literal, from its opening `/` past its flags; -1 when no pattern closes on the same line. */
function regexEnd(src, at) {
  let i = at + 1;
  let cls = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '\n') return -1;
    if (c === '[') cls = true;
    else if (c === ']') cls = false;
    else if (c === '/' && !cls) return i + 1;
    i++;
  }
  return -1;
}

/**
 * The tools reach census — the mirror of the manifest over RUNNABLE MODULES instead of script NAMES. Population
 * is derived from the whole index (`git ls-files`), filtered to runnable modules under tools/, so a file that
 * exists only on the authoring box is not counted and a file the commit owns cannot be forgotten. Liveness is a
 * closure, not a lookup: it starts at the derived rows, the runner door and the declared tools and walks every
 * import a module's code really makes, so nothing below this line has to be written down to be trusted.
 */
export function toolsCensusOf({ index, scripts, read, manifestReport, standby = [], extraRoots = [] }) {
  const violations = [];
  const indexList = index ?? [];
  if (indexList.length === 0) violations.push('no index was supplied to the tools census, so its population is empty by construction — a census of nothing is a green nobody earned');
  const population = indexList.filter((p) => p.startsWith(TOOLS_DIR) && MODULE_RE.test(p)).sort();

  const memo = new Map();
  const readOnce = (p) => {
    if (!memo.has(p)) memo.set(p, read(p));
    return memo.get(p);
  };
  const t0 = Date.now();
  const importsBy = new Map();
  const importersBy = new Map();
  for (const f of indexList) {
    if (!MODULE_RE.test(f)) continue;
    const targets = importsOf(f, readOnce);
    importsBy.set(f, targets);
    for (const t of targets) {
      if (!importersBy.has(t)) importersBy.set(t, []);
      importersBy.get(t).push(f);
    }
  }
  const scan = { files: importsBy.size, ms: Date.now() - t0 };

  const rowFiles = derivePopulation(scripts).map((r) => r.file);
  const rowSet = new Set(rowFiles);
  const dispositions = new Map((manifestReport?.dispositions ?? []).map((d) => [d.name, d.class]));
  const runnerTargets = new Set();
  const namedBy = new Map();
  for (const [name, klass] of dispositions) {
    const target = RUN_RE.exec(String(scripts?.[name] ?? '').trim())?.[1];
    if (!target) continue;
    if (klass === 'runner') runnerTargets.add(target);
    else namedBy.set(target, { name, class: klass });
  }

  const walk = (seeds, into) => {
    const q = [];
    for (const s of seeds) {
      if (into.has(s)) continue;
      into.add(s);
      q.push(s);
    }
    while (q.length) {
      for (const target of importsBy.get(q.shift()) ?? []) {
        if (into.has(target)) continue;
        into.add(target);
        q.push(target);
      }
    }
    return into;
  };
  const live = walk(new Set([...rowFiles, ...runnerTargets, ...extraRoots]), new Set());
  // A second closure, anchored ALSO at the doors the build defers: what only those reach is BEHIND — a state the
  // census derives rather than a favour it grants. An island of dead modules that import one another stays
  // UNREACHED, because its anchors are not doors and a reach inherited from nothing is nothing.
  const deferred = walk(new Set([...live, ...namedBy.keys()]), new Set());

  const classes = new Map();
  for (const f of population) {
    if (runnerTargets.has(f)) classes.set(f, 'runner');
    else if (live.has(f)) classes.set(f, 'reached');
    else if (namedBy.has(f)) classes.set(f, 'named');
    else if (deferred.has(f)) classes.set(f, 'behind');
    else classes.set(f, 'unreached');
  }

  const declared = new Map();
  for (const e of standby) {
    if (declared.has(e.path)) violations.push(`TOOLS_STANDBY disposes ${e.path} twice — two declarations for one module is two answers to one question`);
    declared.set(e.path, e);
  }
  for (const [path, e] of declared) {
    if (!path.startsWith(TOOLS_DIR) || !MODULE_RE.test(path)) violations.push(`TOOLS_STANDBY declares ${path}, which is not a runnable module under ${TOOLS_DIR} — this census grades ${TOOLS_DIR}, and docs/evidence has its own classes`);
    else if (!indexList.includes(path)) violations.push(`TOOLS_STANDBY declares ${path}, which the commit does not own — a declaration outlives its file exactly as long as nobody checks`);
    const derived = classes.get(path);
    if (derived && derived !== 'unreached') violations.push(`TOOLS_STANDBY declares ${path} as standby, but the census DERIVES it as ${derived} — a declaration cannot shadow a derived class`);
    else if (derived === 'unreached') classes.set(path, 'standby');
    for (const field of ['measured', 'blocker', 'next', 'why']) {
      if (String(e[field] ?? '').length < 40) violations.push(`${path} is declared standby without a ${field} a reader can falsify (${JSON.stringify(e[field])}) — a deferral with no next repair is a permanent exclusion wearing a new word`);
    }
    const reachedBy = String(e.reachedBy ?? '');
    const replacedBy = String(e.replacedBy ?? '');
    if (reachedBy === '' && replacedBy === '') violations.push(`${path} is declared standby without naming either a module whose bytes carry its path or a derived row that grades the same face — a standby with no witness is a sentence, not a disposition`);
    if (reachedBy !== '') {
      if (!indexList.includes(reachedBy)) violations.push(`${path} blames ${reachedBy}, which the commit does not own — a witness no clone holds proves nothing`);
      else {
        const bytes = readOnce(reachedBy);
        const holds = bytes !== null && codeLiterals(bytes).some((lit) => lit === path);
        if (!holds) {
          const inProse = String(bytes ?? '').includes(path);
          violations.push(`${reachedBy} does not hold ${path} as a code-position string${inProse ? ' — the only place the path stands is prose, and prose is not a reach' : ''} — a standby that blames a grader has to prove the grader names it`);
        }
      }
    }
    if (replacedBy !== '') {
      if (!indexList.includes(replacedBy)) violations.push(`${path} claims ${replacedBy} grades the same face, and the commit does not own that file`);
      else if (!rowSet.has(replacedBy)) violations.push(`${path} claims ${replacedBy} grades the same face, but PROOF_COMMAND derives no row from it — naming a swept proof as the replacement names a door the build does not walk`);
    }
    violations.push(...gradeMeasured({ who: `${path} (standby)`, modulePath: path, measured: e.measured, isTracked: indexList.includes(path), read: readOnce }));
  }

  const unreached = population.filter((f) => classes.get(f) === 'unreached');
  for (const f of unreached) {
    const doors = Object.entries(scripts ?? {})
      .filter(([name, cmd]) => name.startsWith('verify:') && RUN_RE.exec(String(cmd).trim())?.[1] === f)
      .map(([name]) => name);
    violations.push(`the ${TOOLS_DIR} module ${f} is UNREACHED: no derived row, the runner door or a declared tool imports it or anything they import, and TOOLS_STANDBY says nothing about it${doors.length ? ` — it IS the target of ${doors.join(', ')}, none of which MANIFEST disposes; dispose the NAME and this module is NAMED` : ''}. Say one of ${TOOLS_CLASSES.join(' | ')} — reached (import it from a row), named (wire the door and dispose the NAME), behind (nothing to write: only a deferred door reaches it), standby (measured, blocker, next and a witness) — or delete it`);
  }

  const counts = { total: population.length, runner: 0, reached: 0, named: 0, behind: 0, standby: 0, unreached: 0 };
  for (const c of classes.values()) if (c in counts) counts[c]++;
  const closed = counts.runner + counts.reached + counts.named + counts.behind + counts.standby + counts.unreached;
  if (closed !== counts.total) violations.push(`the tools census closes at ${closed} over ${counts.total} modules under ${TOOLS_DIR} — a module in no class is a module nobody decided about`);

  const behind = population.filter((f) => classes.get(f) === 'behind').map((f) => ({ path: f, importers: importersBy.get(f) ?? [] }));
  return { classes, counts, population, unreached, behind, namedBy, live: live.size, scan, violations };
}

/**
 * The census itself: a pure function over (tracked list, scripts, exclusions, roster, swept population, a
 * reader, the README that restates its counts, the whole index, the workflow text, the MANIFEST dispositions and
 * the TOOLS_STANDBY declarations).
 * Everything below the CLI is exercised by the fixture arms at the bottom, so the refusals are measured on a
 * synthetic plane rather than assumed from reading the code.
 */
export function censusOf({ tracked, scripts, excluded = [], roster = [], swept = [], read, readme = null, index = [], workflow = null, manifest = [], standby = [], source = null, coverage = null, committedAt = null, now = null, refs = null }) {
  const rows = new Map(derivePopulation(scripts).map((r) => [r.file, r]));
  const trackedSet = new Set(tracked);
  const rosterByFile = new Map();
  const violations = [];

  const toolRoots = roster
    .map((e) => ({ file: (String(e.run ?? '').match(RUN_HEAD_RE) || [])[1] }))
    .filter((r) => r.file);
  const { helpers, dangling } = helperClosure({ roots: [...rootsOf(scripts), ...toolRoots], tracked, read });
  for (const d of dangling) violations.push(`a module imports a file the commit does not own: ${d} — it resolves on the authoring box and fails in a checkout`);

  for (const e of roster) {
    if (rosterByFile.has(e.file)) violations.push(`the roster declares ${e.file} twice — two classes for one file is two answers to one question`);
    rosterByFile.set(e.file, e);
  }

  const sweptSet = new Set(swept);
  const classes = new Map();
  for (const f of tracked) {
    const entry = rosterByFile.get(f);
    if (rows.has(f)) classes.set(f, 'row');
    else if (helpers.has(f)) classes.set(f, 'helper');
    else if (sweptSet.has(f)) classes.set(f, 'swept');
    else if (entry && entry.class === 'deferred') classes.set(f, 'deferred');
    else if (entry && entry.class === 'tool') classes.set(f, 'tool');
    else classes.set(f, 'unclassified');
  }

  for (const [f, name] of [...rows].map(([file, r]) => [file, r.name])) {
    if (!trackedSet.has(f)) violations.push(`the row ${name} names ${f}, which the commit does not own — a verify script pointing at an untracked module is a door the build cannot walk`);
    else if (read(f) === null) violations.push(`the row ${name} names ${f}, which the commit owns but this box cannot read`);
  }
  for (const e of excluded) if (!rows.has(e.file)) violations.push(`EXCLUDED names ${e.file}, which is not a row — an exclusion for a proof nobody wires is a stale record`);

  for (const e of roster) {
    if (e.class !== 'tool' && e.class !== 'deferred') violations.push(`the roster gives ${e.file} the class ${JSON.stringify(e.class)} — only tool and deferred are declarable; row, helper and swept are DERIVED`);
    if (!trackedSet.has(e.file)) violations.push(`the roster declares ${e.file}, which the commit does not own — a declaration outlives its file exactly as long as nobody checks`);
    const derived = classes.get(e.file);
    if (derived === 'row' || derived === 'helper' || derived === 'swept') violations.push(`the roster declares ${e.file} as ${e.class}, but the census DERIVES it as ${derived} — a declaration cannot shadow a derived class`);
    if (String(e.why ?? '').length < 40) violations.push(`${e.file} is declared without a reason a reader can falsify (${JSON.stringify(e.why)})`);
    if (!String(e.run ?? '').startsWith('node ') || !String(e.run).includes(e.file)) violations.push(`${e.file}'s run line does not name its own file: ${JSON.stringify(e.run)}`);
    if (e.class === 'deferred') {
      if (String(e.measured ?? '').length < 20) violations.push(`${e.file} is deferred without a measurement (${JSON.stringify(e.measured)}) — a deferral needs a number from a named plane`);
      if (String(e.blocker ?? '').length < 40) violations.push(`${e.file} is deferred without naming the sandbox prerequisite (${JSON.stringify(e.blocker)})`);
      if (String(e.next ?? '').length < 40) violations.push(`${e.file} is deferred without naming the repair that wires it (${JSON.stringify(e.next)}) — a blocker with no next repair is a permanent exclusion wearing a new word`);
      violations.push(...gradeMeasured({ who: `${e.file} (roster deferral)`, modulePath: e.file, measured: e.measured, isTracked: trackedSet.has(e.file), read }));
    }
  }

  const unclassified = tracked.filter((f) => classes.get(f) === 'unclassified');
  const counts = { row: 0, helper: 0, swept: 0, tool: 0, deferred: 0, unclassified: 0 };
  for (const c of classes.values()) if (c in counts) counts[c]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total !== tracked.length) violations.push(`the census closes at ${total} over a population of ${tracked.length} — a module in no class is a module nobody decided about`);

  const excludedSet = new Set(excluded.map((e) => e.file));
  const running = [...rows.values()].filter((r) => !excludedSet.has(r.file));
  const residue = [...rows.values()].filter((r) => excludedSet.has(r.file));
  const armRoster = armsRoster(ARMS.map((a) => a[0]));
  if (typeof readme !== 'string' || readme.trim() === '') {
    violations.push('no README was supplied, so the table that restates these counts is unchecked — the census prints numbers a human copies by hand, and an unchecked copy is the rot this check exists for');
  } else {
    violations.push(...readmeDrift({ readme, counts, running, residue, tracked }));
    violations.push(...readmeArmsDrift({ readme, roster: armRoster }));
    violations.push(...authoringTableDrift({ readme, running, committedAt, now }));
    violations.push(...hostedClaimDrift({ readme, refs }));
  }
  // And the copy inside this file: the header quotes the roster in one marked line, so the number that moves most
  // often here has a reader even while the ADR sections sit in another lane's held files.
  violations.push(...sourceRosterDrift({ source, roster: armRoster }));
  // The arms themselves are on the plane: the fixture carries a small synthetic proof whose refusations are
  // reached, declared or missing, so the grader of the arms list is measured like every other refusal here.
  if (coverage !== null) violations.push(...armCoverage(coverage));

  // The mirror question: not "does every module have a channel" but "does every verify:* NAME have one". Same
  // plane, same call, so one verdict covers both directions and neither can be answered without the other.
  const manifestReport = manifestOf({ scripts, index, read, workflow, manifest });
  violations.push(...manifestReport.violations);

  // And the third: the tools corpus the manifest's doors point at, which no class above grades because it is not
  // under docs/evidence. Liveness means THE BUILD WALKS IT, so the roots are the derived rows, the runner door
  // and this census's own declared tools — deliberately not every `verify:*` node target, because a door v607
  // deferred does not run, and treating it as live would relabel its helpers `reached` and lose `named` and
  // `behind` both.
  const toolsReport = toolsCensusOf({ index, scripts, read, manifestReport, standby, extraRoots: toolRoots.map((r) => r.file) });
  violations.push(...toolsReport.violations);

  return { classes, rows, helpers, dangling, unclassified, counts, manifest: manifestReport, tools: toolsReport, violations };
}

/**
 * The README restates this census in a table and one "at this ref" sentence. Both had gone stale by hand by
 * v542 — v533's "111 modules / 84 rows" survived three increments, and the arms roster still read 35 after
 * v540 measured 40 — because nothing recomputed them. The shapes are graded EXACTLY: a class whose row is
 * missing or reshaped is a red asking for the edit, not a silent skip (the absence-is-silent class).
 */
export function readmeDrift({ readme, counts, running, residue, tracked }) {
  const violations = [];
  const flat = String(readme).replace(/\s+/g, ' ');
  const cell = (label) => {
    const m = new RegExp(`\\| ${label} \\| \\*\\*(\\d+)\\*\\*(.*?)\\|`).exec(flat);
    return m ? { n: Number(m[1]), rest: m[2] } : null;
  };
  const row = cell('ROW');
  if (row === null) {
    violations.push('the README has no readable ROW row — a table that cannot be read cannot be trusted to hold these numbers');
  } else {
    if (row.n !== counts.row) violations.push(`the README's ROW row says ${row.n} rows; this census derived ${counts.row}`);
    const split = /\((\d+) run \+ (\d+) excluded\)/.exec(row.rest);
    if (split === null) {
      violations.push(`the README's ROW cell no longer states "(N run + M excluded)", so its split of ${row.n} cannot be checked`);
    } else if (Number(split[1]) !== running.length || Number(split[2]) !== residue.length) {
      violations.push(`the README's ROW row says ${split[1]} run + ${split[2]} excluded; this census derived ${running.length} run + ${residue.length} excluded`);
    }
  }
  for (const [label, want] of [['HELPER', counts.helper], ['SWEPT', counts.swept], ['TOOL', counts.tool], ['DEFERRED', counts.deferred]]) {
    const c = cell(label);
    if (c === null) violations.push(`the README has no readable ${label} row — a class this census counts is one the table must state`);
    else if (c.n !== want) violations.push(`the README says ${c.n} ${label} module(s); this census derived ${want}`);
  }
  const trackedM = /every one of the \*\*(\d+)\*\* tracked modules/.exec(flat);
  if (trackedM === null) violations.push('the README\'s "tracked modules" sentence is missing or reshaped — the census cannot check the number it restates');
  else if (Number(trackedM[1]) !== tracked.length) violations.push(`the README says ${trackedM[1]} tracked modules; this census read ${tracked.length} from the index`);
  const atRef = /\*\*(\d+) running rows \+ (\d+) excluded by name\*\* at this ref/.exec(flat);
  if (atRef === null) violations.push('the README\'s "running rows ... at this ref" sentence is missing or reshaped — the census cannot check the number it restates');
  else if (Number(atRef[1]) !== running.length || Number(atRef[2]) !== residue.length) {
    violations.push(`the README's "at this ref" sentence says ${atRef[1]} running + ${atRef[2]} excluded; this census derived ${running.length} + ${residue.length}`);
  }
  return violations;
}

/** The number words this reader knows; anything else in the arms sentence is refused by name. */
const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** A family count written in words, compound included: an arms list past ninety says twenty-four, not 24. */
function numberWord(word) {
  const parts = String(word).split('-');
  const tens = NUMBER_WORDS[parts[0]];
  if (tens === undefined) return undefined;
  if (parts.length === 1) return tens;
  const unit = parts.length === 2 ? NUMBER_WORDS[parts[1]] : undefined;
  if (tens < 20 || tens % 10 !== 0 || unit === undefined || unit > 9) return undefined;
  return tens + unit;
}

/**
 * The fixture-arms roster, DERIVED from the arm names rather than copied out of them: one entry per name prefix,
 * in the order the arms first appear. This is the fact the README's sentence is measured against (v610).
 */
export function armsRoster(names) {
  const order = [];
  const byLabel = new Map();
  for (const name of names) {
    const label = /^([A-Za-z]+)\d+/.exec(String(name))?.[1] ?? '';
    if (label === '') continue;
    if (!byLabel.has(label)) {
      byLabel.set(label, 0);
      order.push(label);
    }
    byLabel.set(label, byLabel.get(label) + 1);
  }
  return { total: names.length, families: order.map((label) => ({ label, count: byLabel.get(label) })) };
}

/**
 * Grade the README's arms sentence against that roster (v610).
 *
 * The sentence is the same kind of claim v543 caught in the class table — a number a human copies from the
 * console line — and it had already drifted once by hand. Two shapes are read, both by grammar rather than by
 * position: `**N fixture arms**` for the total, and the breakdown in which every family must be stated as
 * `<number-word> above` or `<number-word> that …`, in the order the arms list defines. That grammar is why
 * "six that drift one README number each" does not read as two families: only a number followed by `above` or
 * `that` is a claim about a family. A word outside NUMBER_WORDS is refused rather than skipped, and a family the
 * sentence dropped is a length mismatch — an absent claim is the silence this file keeps being asked to break.
 */
export function readmeArmsDrift({ readme, roster }) {
  const violations = [];
  const flat = String(readme).replace(/\s+/g, ' ');
  const totalM = /\*\*(\d+) fixture arms\*\*/.exec(flat);
  if (totalM === null) {
    violations.push('the README states no "**N fixture arms**" total — the census prints the roster every run, so the copy of it in prose is unchecked');
  } else if (Number(totalM[1]) !== roster.total) {
    violations.push(`the README says ${totalM[1]} fixture arms; this census runs ${roster.total} (${roster.families.map((f) => `${f.label}${f.count}`).join(' ')}) — the sentence restates a roster that moved, and the printout is the copy's source`);
  }
  const start = flat.indexOf('fixture arms** prove each refusal on a synthetic plane');
  if (start === -1) {
    violations.push('the README\'s fixture-arms sentence is missing or reshaped — the census cannot check the per-family numbers it restates');
    return violations;
  }
  const body = flat.slice(start);
  const end = body.indexOf('the prose-import arm');
  if (end === -1) {
    violations.push('the README\'s fixture-arms breakdown no longer ends at the prose-import clause, so its family sequence has no bound this reader can take on trust');
    return violations;
  }
  const stated = [];
  for (const m of body.slice(0, end).matchAll(/\b([A-Za-z][\w-]*)\s+(?:above|that)\b/g)) {
    const word = m[1];
    const n = numberWord(word);
    if (n === undefined) {
      violations.push(`the README's arms breakdown states a family as "${m[0]}" — ${JSON.stringify(word)} is not a number this reader parses (one…twenty, thirty…ninety, and a compound such as twenty-four), so the claim cannot be checked and is refused rather than skipped`);
      return violations;
    }
    stated.push({ word, n, phrase: m[0] });
  }
  if (stated.length !== roster.families.length) {
    violations.push(`the README's arms breakdown names ${stated.length} families; the arms list defines ${roster.families.length} (${roster.families.map((f) => `${f.label}${f.count}`).join(' ')}) — state each family's count or the sentence rests on a copy`);
    return violations;
  }
  const sum = stated.reduce((a, s) => a + s.n, 0);
  if (totalM !== null && sum !== Number(totalM[1])) {
    violations.push(`the README's family numbers add to ${sum} against its own total of ${totalM[1]} fixture arms — the breakdown and the headline are two answers to one question`);
  }
  stated.forEach((s, i) => {
    const want = roster.families[i];
    if (s.n !== want.count) {
      const other = roster.families.findIndex((f) => f.count === s.n);
      violations.push(`the README's arm family ${i + 1} (${want.label}) says "${s.phrase}", i.e. ${s.n}; this census counts ${want.count} arms named ${want.label}* — ${other === -1 ? 'no family holds that number, so the sentence is out of date' : `it is the count of family ${roster.families[other].label}, so two families were swapped`}`);
    }
  });
  return violations;
}

/**
 * Grade the roster line this file carries in its own header (v611).
 *
 * The header is where the record lives while the ADR sections sit in another lane's held files, and a roster
 * quoted there is the same kind of copy the README sentence is — one number short of the list it describes, said
 * in a voice that reads like history. So the claim gets a MARKED line rather than prose: one shape, `// ROSTER <n>
 * arms in <k> families — <label><count> · …`, parsed or refused, while the paragraphs around it stay free to keep
 * the numbers they held the day they were written (v533's "eighty-one" is a fact about v533, and a reader who
 * cannot tell the two apart should refuse the marker, not the history). The line names only this file's own list,
 * which no other lane can move: the README's class cells are the repository's numbers and they do move under a
 * shared tree, and a marker keyed to them would redden the census for work nobody asked it to review.
 */
export function sourceRosterDrift({ source, roster }) {
  const violations = [];
  const line = /^\/\/ ROSTER (.+)$/m.exec(String(source ?? ''));
  if (line === null) {
    violations.push('this file states no "// ROSTER …" line, so the roster its header quotes is a sentence with nothing behind it — state the marked count or drop the number');
    return violations;
  }
  const m = /^(\d+) arms in (\d+) families — (.+)$/.exec(line[1].trim());
  if (m === null) {
    violations.push(`the ROSTER line is reshaped (${JSON.stringify(line[1].trim())}) — the reader takes "<n> arms in <k> families — <label><count> · …", and a marker nothing parses is a comment`);
    return violations;
  }
  const stated = m[3].split(' · ');
  if (Number(m[1]) !== roster.total) violations.push(`the ROSTER line says ${m[1]} arms; the arms list defines ${roster.total} — the marker restates a roster that moved inside this file`);
  if (Number(m[2]) !== roster.families.length) violations.push(`the ROSTER line says ${m[2]} families; the arms list defines ${roster.families.length} (${roster.families.map((f) => `${f.label}${f.count}`).join(' ')})`);
  if (stated.length !== roster.families.length) {
    violations.push(`the ROSTER line lists ${stated.length} family pair(s); the arms list defines ${roster.families.length} — the marker and its own count disagree about how many families it names`);
    return violations;
  }
  const sum = stated.reduce((a, s) => a + Number(/(\d+)$/.exec(s)?.[1]), 0);
  if (Number.isNaN(sum)) violations.push(`the ROSTER line states a family as ${JSON.stringify(stated.find((s) => !/\D+\d+$/.test(s)))} — a pair is a letter prefix and a count, in that order`);
  else if (Number(m[1]) !== sum) violations.push(`the ROSTER line's families add to ${sum} against its own headline of ${m[1]} arms — the marker answers its question twice`);
  stated.forEach((pair, i) => {
    const want = roster.families[i];
    if (pair !== `${want.label}${want.count}`) violations.push(`the ROSTER line's family ${i + 1} says ${JSON.stringify(pair)}; this census counts ${want.count} arms named ${want.label}* (${want.label}${want.count})`);
  });
  return violations;
}

/**
 * The calendar day the box that runs this sees, spelled without a locale: an ICU-less Node renders `en-CA` as
 * `en-US`, and a date read out of a M/D/YYYY string would compare against a YYYY-MM-DD one and refuse honest
 * measurements. Both sides of every comparison below are local calendar days, so no timezone enters the arithmetic.
 */
function localDay(epochSec) {
  const d = new Date(Number(epochSec) * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (day) => (DAY_RE.test(String(day)) ? Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000) : NaN);
const cellsOf = (line) => {
  const t = String(line).trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return null;
  return t.slice(1, -1).split('|').map((c) => c.trim());
};

export const AUTHORING_HEADER_PREFIX = '| row | proof |';
export const AUTHORING_HEADER = '| row | proof | measured on the authoring box |';
const DURATION_RE = /\d[\d.,]*\s*(?:ms|s\b|m\b)/;
const cellPath = (cell) => String(cell ?? '').replace(/`/g, '').trim();

/** The files the table claims to have timed, so main() can fetch their commit dates by path instead of guessing them. */
export function authoringTablePaths(readme) {
  const lines = String(readme ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim().startsWith(AUTHORING_HEADER_PREFIX));
  if (at === -1) return [];
  return tableRows(lines.slice(at + 1)).map((r) => cellPath(r.cells[1])).filter(Boolean);
}

/** The table's data rows, with the separator left out: a row is a line of three cells that is not `---`. */
function tableRows(body) {
  const rows = [];
  for (const line of body) {
    const cells = cellsOf(line);
    if (cells === null) break;
    if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    rows.push({ line: line.trim(), cells });
  }
  return rows;
}

/**
 * Date the authoring-box table against the commits it blames (v625).
 *
 * This file has readers for the counts the README restates (v543), for the numbers a deferral quotes (v609), for
 * the arms roster in two copies (v610, v611) and for the arms list itself (v624). The one number-set it published
 * and never read was the table of DURATIONS — four rows under one headline date, 2026-10-28, while three of the
 * four files it names have been committed since (v605 on 11-04, v566 on 11-02, v591-follow-up on 11-04). A timing
 * is a measurement, so it ages exactly the way a count does, and one headline over four files is the shape that
 * hid the aging: the day never moved because nobody had to move it. The table now carries one date per row, and
 * every row's date is checked against the last commit that touched the file that row runs.
 *
 * Two bounds, said rather than left to guesswork. The table is a CLAIM SET, not a census of times: a row that
 * appears here is checked, and a row that does not is nobody's lie — the census has no measured duration for 112
 * rows and refuses to pretend otherwise. And the comparison is by CALENDAR DAY, not by instant: a commit that
 * lands on the measured day passes, because a human writes "today" and the run may have started before it.
 */
export function authoringTableDrift({ readme, running, committedAt, now }) {
  const violations = [];
  const lines = String(readme ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim().startsWith(AUTHORING_HEADER_PREFIX));
  if (at === -1) {
    violations.push('the README states no "| row | proof | …" table — the durations this file publishes are its own claim about the rows it runs, and a table no reader walks is a claim nobody checks');
    return violations;
  }
  const header = lines[at].trim();
  if (header !== AUTHORING_HEADER) {
    violations.push(`the authoring-box table's header is ${JSON.stringify(header)} — the reader takes ${JSON.stringify(AUTHORING_HEADER)}, and a date carried in the headline times every row with one day, which is how this table fell behind three of its four files while its headline never moved`);
    return violations;
  }
  if (committedAt === null || committedAt === undefined || typeof now !== 'number') {
    violations.push('no commit dates or run-day were supplied, so the measurements this table states cannot be dated against the bytes they blame — a timing read before a commit is a timing about different code');
    return violations;
  }
  const rows = tableRows(lines.slice(at + 1));
  if (rows.length === 0) {
    violations.push('the authoring-box table has a header and no rows — an empty table reads as a claim nobody makes, which is the silence this reader exists to break');
    return violations;
  }
  const byName = new Map(running.map((r) => [r.name, r.file]));
  const seen = new Set();
  for (const { line, cells } of rows) {
    if (cells.length !== 3) {
      violations.push(`the authoring-box row ${JSON.stringify(line)} has ${cells.length} cell(s), not the three the reader takes (row, proof, measured) — a claim this reader cannot split is a claim it cannot check`);
      continue;
    }
    const [rawName, rawPath, claim] = [cellPath(cells[0]), cellPath(cells[1]), String(cells[2])];
    if (!byName.has(rawName)) {
      violations.push(`the authoring-box table times ${rawName}, which is not a row this census runs — a measurement of a door the build does not walk measures nothing the build can rely on`);
      continue;
    }
    if (seen.has(rawName)) {
      violations.push(`the authoring-box table names ${rawName} twice — two durations for one row is one number that is not the row's`);
      continue;
    }
    seen.add(rawName);
    const want = byName.get(rawName);
    if (rawPath !== want) {
      violations.push(`the authoring-box row for ${rawName} names ${rawPath}, but that row runs ${want} — the claim times a module the build does not run under that name`);
      continue;
    }
    if (!DURATION_RE.test(claim)) {
      violations.push(`the authoring-box row for ${rawName} states no duration this reader parses (${JSON.stringify(claim)}) — "fast", "a few seconds" and a prose aside are not measurements`);
    }
    const dateM = /(\d{4}-\d{2}-\d{2})/.exec(claim);
    if (dateM === null) {
      violations.push(`the authoring-box row for ${rawName} states a duration with no date (${JSON.stringify(claim)}) — a measurement that does not say when is a measurement that cannot go stale, which is the wrong kind of permanent`);
      continue;
    }
    const measured = dayNumber(dateM[1]);
    if (Number.isNaN(measured)) {
      violations.push(`the authoring-box row for ${rawName} dates its measurement ${JSON.stringify(dateM[1])}, which is not a calendar day this reader can order — write it as YYYY-MM-DD`);
      continue;
    }
    if (measured > dayNumber(localDay(now))) {
      violations.push(`the authoring-box row for ${rawName} is dated ${dateM[1]}, after the ${localDay(now)} this census runs on — a measurement cannot be taken from a day that has not arrived`);
      continue;
    }
    const landed = committedAt[rawPath];
    if (!landed || typeof landed.at !== 'number') {
      violations.push(`the authoring-box row for ${rawName} times ${rawPath}, which has no commit date this census can read — a duration about bytes the repository does not hold is about nothing the build runs`);
      continue;
    }
    const commitDay = localDay(landed.at);
    if (dayNumber(commitDay) > measured) {
      violations.push(`the authoring-box row for ${rawName} was measured on ${dateM[1]}, but ${rawPath} last changed in ${landed.ref ?? '?'}, committed ${commitDay} — the table times bytes that no longer exist, so re-run the row and move its date, or drop the claim`);
    }
  }
  return violations;
}

/**
 * The three tokens a hosted claim is written from, each read out of its PARAGRAPH rather than its line: the README
 * wraps, so the address a run tested and the population that same run printed can sit three lines apart, and a
 * reader that walked lines would grade the first and silently skip the second. The address is matched PERMISSIVELY
 * — anything between the backticks after `sha` is taken — so a wrong shape is refused by name instead of
 * passing for the absence of a claim. A run id is nine to twelve digits inside backticks, which is the shape this
 * file has always written them in.
 */
const SHA_CLAIM_RE = /sha\s*`([^`\n]{1,80})`/g;
const SHA_GOOD_RE = /^[0-9a-f]{7,40}$/;
const RUN_CLAIM_RE = /`(\d{9,12})`/g;
const POP_CLAIM_RE = /derived population of (\d+)/g;
const DAY_TEXT_RE = /\d{4}-\d{2}-\d{2}/;
/**
 * The same address with no word in front of it (v631). A commit abbreviation and a content digest have the same
 * shape, so this shape alone decides nothing: the census takes a bare token as an address only where its own
 * history resolves it to exactly one commit, and reads every other one as what a digest most likely is. The
 * letters tell the two claim shapes apart: a token of digits only is a run, never a ref.
 */
const BARE_SHA_RE = /`([0-9a-f]{7,40})`/g;
const isAddressShape = (t) => SHA_GOOD_RE.test(t) && /[a-f]/.test(t);

/** The hosted clock is UTC on both sides: a runner stamps its own start in UTC, and so does a commit. */
const utcDay = (epochSec) => new Date(Number(epochSec) * 1000).toISOString().slice(0, 10);
const nextUtcDay = (day) => new Date((dayNumber(day) + 1) * 86_400_000).toISOString().slice(0, 10);

/**
 * The bracketed group an address sits in, because that is where a claim writes the date of its run:
 * `(sha `604d14e`, 2026-10-30)`. A group with a nested paren is not taken — the day inside it may belong to the
 * nested clause rather than to the address — and a date outside any group is not a claim about this ref.
 */
function groupAround(text, at) {
  const open = text.lastIndexOf('(', at);
  const close = text.indexOf(')', at);
  if (open === -1 || close === -1 || close < open) return null;
  const inner = text.slice(open + 1, close);
  return inner.includes('(') ? null : inner;
}

/**
 * One paragraph of README, read for what it claims about a commit: an entry per address, carrying the run id
 * written before it (the id RESETS at each address, so a second address in one paragraph must name its own run
 * rather than inherit the first), the day inside the parentheses around it, and every population stated after it.
 * A population that precedes any address is returned separately: those are this box's own `--only` selections,
 * where the number counts the rows a person asked the runner for and no ref is named to check it against, so the
 * census prints them instead of guessing which ref they meant.
 */
function parseParagraph(parts, isAddress = null) {
  const joined = parts.map((p) => p.text).join('\n');
  const lineAt = (idx) => {
    let acc = 0;
    for (const p of parts) {
      acc += p.text.length + 1;
      if (idx < acc) return p.line;
    }
    return parts.at(-1).line;
  };
  const events = [];
  for (const m of joined.matchAll(RUN_CLAIM_RE)) events.push({ i: m.index, run: m[1] });
  const spelledAt = new Set();
  for (const m of joined.matchAll(SHA_CLAIM_RE)) {
    const at = m.index + m[0].indexOf(m[1]);
    spelledAt.add(at);
    events.push({ i: at, sha: m[1], spelled: true });
  }
  // Every bare commit-shaped token in the paragraph is a candidate, on both passes: pass one hands the census the
  // list it must resolve, and the ambiguity refusal below aims at the candidates it resolved to more than one
  // commit. Pass two turns a candidate into an address, and only where isAddress says this clone resolves one.
  const cands = [];
  for (const m of joined.matchAll(BARE_SHA_RE)) {
    const at = m.index + 1;
    if (spelledAt.has(at) || !isAddressShape(m[1])) continue;
    cands.push({ at, line: lineAt(at), token: m[1] });
    if (isAddress !== null && isAddress(m[1])) events.push({ i: at, sha: m[1], spelled: false });
  }
  for (const m of joined.matchAll(POP_CLAIM_RE)) events.push({ i: m.index, pop: Number(m[1]) });
  events.sort((a, b) => a.i - b.i);
  const claims = [];
  const unowned = [];
  const ids = [...new Set([...joined.matchAll(RUN_CLAIM_RE)].map((m) => m[1]))];
  let run = null;
  let lastSpelled = null;
  for (const e of events) {
    if (e.run !== undefined) { run = e.run; continue; }
    if (e.sha !== undefined) {
      const group = groupAround(joined, e.i);
      const day = group === null ? null : (DAY_TEXT_RE.exec(group) ?? [])[0] ?? null;
      // A bare address answers WHICH commit a run tested, and nothing about what that commit held: the day and the
      // population are graded only against an address the writer spelled with the word sha. Measured the day this
      // landed, the graded README wrote a worktree base between backticks (`03279a2` plus this change) and quoted
      // the candidate tree's row count after it: graded against the base, a true number read as a lie.
      const claim = { line: lineAt(e.i), shaText: e.sha, spelled: e.spelled, run, day: e.spelled ? day : null, pops: [] };
      claims.push(claim);
      run = null;
      if (e.spelled) lastSpelled = claim;
      continue;
    }
    if (lastSpelled === null) unowned.push({ line: lineAt(e.i), p: e.pop });
    else lastSpelled.pops.push(e.pop);
  }
  return { claims, unowned, ids, cands, pops: [...joined.matchAll(POP_CLAIM_RE)].length };
}

/**
 * The whole README, paragraph by paragraph: blank lines close a claim, because a hosted verdict is one
 * paragraph. The record keeps one entry per paragraph that writes a run number — its first line, the
 * distinct ids in it, and the ids an address in this same paragraph carries — because v630 asks whether
 * the number and the ref that answers for it were written together, which is a question about a paragraph
 * rather than about the file. */
export function hostedClaims(readme, isAddress = null) {
  const claims = [];
  const unowned = [];
  const paragraphs = [];
  let parts = [];
  const flush = () => {
    if (parts.length === 0) return;
    const parsed = parseParagraph(parts, isAddress);
    claims.push(...parsed.claims);
    unowned.push(...parsed.unowned);
    paragraphs.push({
      line: parts[0].line,
      ids: parsed.ids,
      runs: parsed.claims.map((c) => c.run).filter((r) => r !== null),
      pops: parsed.pops,
      cands: parsed.cands.filter((c) => !(isAddress !== null && isAddress(c.token))),
    });
    parts = [];
  };
  String(readme ?? '').split(/\r?\n/).forEach((text, i) => {
    if (text.trim() === '') { flush(); return; }
    parts.push({ text, line: i + 1 });
  });
  flush();
  return { claims, unowned, paragraphs };
}

/**
 * The same sight turned outward (v631): what the reader would find in the evidence READMEs this census does NOT
 * grade. Their bytes belong to the lanes that wrote them, so the answer is printed and not refused, and the count
 * that moves is the record of how much of this class is still out there. `history` is HEAD's own log, so the
 * resolution here needs no git call and grades nothing.
 */
export function corpusAddressSight({ texts, history }) {
  const hits = (t) => history.filter((h) => h.full.startsWith(t)).length;
  return Object.entries(texts ?? {}).map(([file, text]) => {
    const { claims, paragraphs } = hostedClaims(text);
    const spelled = new Set(claims.map((c) => c.shaText));
    const bare = [...new Set(paragraphs.flatMap((p) => p.cands.map((c) => c.token)))].filter((t) => !spelled.has(t));
    return {
      file,
      resolving: bare.filter((t) => hits(t) === 1).length,
      ambiguous: bare.filter((t) => hits(t) > 1).length,
      digests: bare.filter((t) => hits(t) === 0).length,
      runIds: paragraphs.flatMap((p) => p.ids).length,
      bareRuns: paragraphs.filter((p) => p.ids.length > 0 && p.runs.length === 0).length,
    };
  });
}

/**
 * The derivation a hosted population depends on, taken as the FUNCTION's own bytes rather than the file's:
 * proof-set.mjs changes for reasons that never touch derivePopulation, and a claim only becomes ungradeable when
 * the rule it was counted with has moved.
 */
export function derivationText(src) {
  const s = String(src ?? '').replace(/\r\n/g, '\n');
  const at = s.indexOf('function derivePopulation');
  if (at === -1) return null;
  const end = s.indexOf('\n}', at);
  return end === -1 ? null : s.slice(at, end + 2);
}

/**
 * Re-derive the hosted claims from the commits they name (v626).
 *
 * v609 bounded a hosted run number as prose ABOUT a measurement, and the bound was right about the log and wrong
 * about the rest: this clone cannot replay a runner's stdout, but it can answer what the commit that runner tested
 * held. So every `sha `x`` in this file is resolved against HEAD's history, every population stated after it is
 * re-derived from the package.json committed AT it, and every date written in the parentheses around it is compared
 * with that commit's own UTC day. Measured as this landed: sixteen addresses over fourteen distinct commits, each
 * resolving to exactly one commit on this history; eight of them dated, and every one dated the day its commit
 * landed; nine population claims stated after an address, all nine agreeing; and six more that name no address
 * before them — the box's own `--only` runs — which are printed, not graded.
 *
 * What stays prose, said rather than left to be discovered: the green FRACTION, because a selection run answers
 * `1/1 green of a derived population of 103` and the one counts the rows a person asked for, not the population;
 * every duration, byte count and gutter read out of a hosted log, because the log is not in this clone; and a
 * claim at a ref where derivePopulation itself has since changed, which is DECLINED and printed, because it was
 * true of the rules of its own time and no number read today can call it a lie.
 *
 * v630 lifts the bound that left a BARE run number as prose, on purpose and in writing: the paragraph that
 * writes one now owes the address of the commit that run tested, because every bare number this file held
 * turned out to be readable from the host and re-derivable here — so the number is graded with the rest of
 * its claim instead of resting on a reader who trusts it.
 */
export function hostedClaimDrift({ readme, refs }) {
  const violations = [];
  // An address is what this clone resolves, not the word written in front of it (v631): the claim list is read
  // with the ref facts in hand, so a bare token that resolves to exactly one commit here is graded the way the
  // spelled address beside it is, and one that resolves to nothing stays what a digest most likely is.
  const isAddress = (t) => {
    const r = refs === null || refs === undefined ? undefined : refs[t];
    return r !== undefined && r.count === 1 && r.ancestor === true;
  };
  const { claims, paragraphs } = hostedClaims(readme, isAddress);
  // A run number is only answerable beside the ref its run tested, so the paragraph that writes one must name it
  // (v630). v626 left this as prose on purpose, because a bare number had nothing to be graded against — and the
  // nine this file itself wrote were then read off the host, resolved and anchored, so the bound lifts where the
  // file can meet it. Per PARAGRAPH rather than per file, because a number and the address that answers for it are
  // one verdict: an id anchored three sections away is a copy someone pasted, not a claim about this sentence.
  for (const p of paragraphs) {
    for (const id of p.ids) {
      if (p.runs.includes(id)) continue;
      violations.push(`the paragraph at line ${p.line} writes run ${id} with no commit address in the same paragraph — a hosted verdict is re-derived from the ref its run tested, so name that ref beside the number or leave the number out`);
    }
  }
  // A bare token that resolves to two or more commits is the one case where the shape and the reading disagree:
  // it may be an abbreviation this clone cannot pin, or a content digest that happens to look like one. The census
  // refuses it only where the same paragraph stakes a verdict a ref is supposed to answer for (v631). Measured
  // before this shipped: zero such tokens in the graded README, and zero in the other eight evidence READMEs.
  for (const p of paragraphs) {
    if (p.ids.length === 0 && p.pops === 0) continue;
    for (const c of p.cands) {
      const r = refs === null || refs === undefined ? undefined : refs[c.token];
      if (r === undefined || r.count <= 1) continue;
      violations.push(`the paragraph at line ${p.line} writes ${c.token} between backticks and stakes a run or a population on it, but ${r.count} commits in this clone share that abbreviation, and a bare token is read as an address only where exactly one commit answers for it — name it with the word sha and enough characters to pin it, or move the verdict onto a ref this census can resolve`);
    }
  }
  if (claims.length === 0) return violations;
  if (refs === null || refs === undefined) {
    violations.push(`the census was handed no ref facts, so all ${claims.length} hosted claim(s) here are unchecked — a verdict re-derived from nothing is a promise the build cannot keep`);
    return violations;
  }
  const anchored = new Map();
  for (const c of claims) {
    if (c.run === null) continue;
    const seen = anchored.get(c.run);
    if (seen === undefined) anchored.set(c.run, c.shaText);
    else if (seen !== c.shaText) violations.push(`run ${c.run} is claimed against two commits here — ${seen} and ${c.shaText}: one run tests one ref, so one of these sentences describes a build that did not happen`);
  }
  for (const c of claims) {
    const where = `line ${c.line}`;
    if (!SHA_GOOD_RE.test(c.shaText)) {
      violations.push(`the hosted claim on ${where} writes sha ${JSON.stringify(c.shaText)}, which is not a commit address (7 to 40 hex characters) — an address this census cannot resolve is a verdict it cannot check`);
      continue;
    }
    const ref = refs[c.shaText];
    if (ref === undefined || ref.count === 0) {
      violations.push(`the hosted claim on ${where} names ${c.shaText}, which no commit in this clone answers — the claim is graded against history, so either the address is wrong or the checkout is shallow (the proofs step declares fetch-depth 0 for exactly this)`);
      continue;
    }
    if (ref.count > 1) {
      violations.push(`the hosted claim on ${where} names ${c.shaText}, which ${ref.count} commits in this clone share — an abbreviation that resolves twice resolves to nothing, so write the address out`);
      continue;
    }
    if (ref.ancestor === false) {
      violations.push(`the hosted claim on ${where} names ${c.shaText}, a commit that is not on this history — the verdict is about bytes the build does not carry, so name the branch that ran them or move the claim`);
      continue;
    }
    for (const p of c.pops) {
      if (ref.rows === null || ref.rows === undefined) continue;
      if (p !== ref.rows) violations.push(`the hosted claim on ${where} says a derived population of ${p} at ${c.shaText}; the scripts committed there derive ${ref.rows} — a green count is a fact about the ref it tested, and this ref does not add up`);
    }
    if (c.day === null) continue;
    const stated = dayNumber(c.day);
    if (Number.isNaN(stated)) {
      violations.push(`the hosted claim on ${where} dates its run ${JSON.stringify(c.day)}, which is not a calendar day this reader can order — write YYYY-MM-DD, the form the hosted timestamps are kept in`);
      continue;
    }
    const landed = utcDay(ref.at);
    if (stated < dayNumber(landed)) {
      violations.push(`the hosted claim on ${where} dates its run ${c.day}, before ${c.shaText} landed on ${landed} UTC — a run cannot test bytes that do not exist yet, and both sides of this comparison are UTC, so no timezone explains it`);
      continue;
    }
    if (stated > dayNumber(nextUtcDay(landed))) {
      violations.push(`the hosted claim on ${where} dates its run ${c.day}, more than a UTC day after ${c.shaText} landed on ${landed} — a push starts its run in minutes, so a gap that wide is a date copied off the wrong line`);
    }
  }
  return violations;
}

/**
 * A refusal this file AUTHORS, keyed by the function that says it and the order it says it in. The key is
 * stable across edits elsewhere; a line number would rot the day someone asks for a shorter message.
 */
const FRAME_CLOSE = { ')': '(', ']': '[', '}': '{' };
/**
 * Where a bracketed expression ends, with the frames it opens on a stack. Parens, braces and template
 * interpolations counted in one depth variable is how a first draft ran one push into the six refusals after
 * it and read the whole file as a single message. A doc comment that quotes the call with its opening bracket
 * trips the same reader, which is why this one does not: the index below takes a closed push as an authored
 * refusal, and prose that mimics one is prose the census would count twice.
 */
function scanFrame(text, open) {
  const st = [{ c: text[open], outer: true }];
  for (let i = open + 1; i < text.length; i += 1) {
    const top = st.at(-1);
    const c = text[i];
    if (top.c === "'" || top.c === '"') {
      if (c === '\\') { i += 1; continue; }
      if (c === top.c) st.pop();
      continue;
    }
    if (top.c === '`') {
      if (c === '\\') { i += 1; continue; }
      if (c === '$' && text[i + 1] === '{') { st.push({ c: '{' }); i += 1; continue; }
      if (c === '`') st.pop();
      continue;
    }
    if (c === "'" || c === '"' || c === '`' || c === '(' || c === '[' || c === '{') { st.push({ c }); continue; }
    if (c === ')' || c === ']' || c === '}') {
      const want = FRAME_CLOSE[c];
      let at = -1;
      for (let j = st.length - 1; j >= 0; j -= 1) if (st[j].c === want) { at = j; break; }
      if (at === -1) return -1;
      const popped = st.splice(at);
      if (popped[0].outer) return i;
    }
  }
  return -1;
}

const flatText = (s) => String(s).replace(/\s+/g, ' ').trim();
const unescapeText = (b) => b.replace(/\\n|\\t/g, ' ').replace(/\\(['"`\\])/g, '$1');

/** The literal text a message expression authors, with every `${…}` hole cut out of it. */
function literalSegments(expr) {
  const out = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      let buf = '';
      while (j < expr.length && expr[j] !== c) {
        if (expr[j] === '\\') { buf += expr.slice(j, j + 2); j += 2; continue; }
        buf += expr[j];
        j += 1;
      }
      const text = flatText(unescapeText(buf));
      if (text.length >= 8) out.push(text);
      i = j + 1;
    } else if (c === '`') {
      let j = i + 1;
      let buf = '';
      const flush = () => {
        const t = flatText(unescapeText(buf));
        if (t.length >= 8) out.push(t);
        buf = '';
      };
      while (j < expr.length && expr[j] !== '`') {
        if (expr[j] === '\\') { buf += expr.slice(j, j + 2); j += 2; continue; }
        if (expr[j] === '$' && expr[j + 1] === '{') {
          flush();
          const close = scanFrame(expr, j + 1);
          if (close === -1) return out;
          j = close + 1;
          continue;
        }
        buf += expr[j];
        j += 1;
      }
      flush();
      i = j + 1;
    } else i += 1;
  }
  return out;
}

/** A produced message matches an authored site when every literal the site authors appears in it, in order. */
export function segmentsMatch(message, segs) {
  const flat = flatText(message);
  let from = 0;
  for (const seg of segs) {
    const at = flat.indexOf(seg, from);
    if (at === -1) return false;
    from = at + seg.length;
  }
  return true;
}

export function refusalSites(source) {
  const src = String(source ?? '');
  const names = [];
  for (const m of src.matchAll(/^(?:export )?(?:async )?function (\w+)|^const (\w+) = (?:async )?\(/gm)) names.push({ name: m[1] ?? m[2], at: m.index });
  const sites = [];
  const forwards = [];
  const unreadable = [];
  const counts = {};
  for (const m of src.matchAll(/violations\.push\(/g)) {
    const open = m.index + 'violations.push'.length;
    const close = scanFrame(src, open);
    const line = src.slice(0, m.index).split('\n').length;
    if (close === -1) {
      unreadable.push(`L${line}`);
      continue;
    }
    const fn = names.filter((n) => n.at < m.index).at(-1)?.name ?? '(top level)';
    const segs = literalSegments(src.slice(open + 1, close));
    if (segs.length === 0) {
      forwards.push(`${fn}#L${line}`);
      continue;
    }
    counts[fn] = (counts[fn] ?? 0) + 1;
    sites.push({ key: `${fn}#${counts[fn]}`, fn, line, segs });
  }
  return { sites, forwards, unreadable };
}

/**
 * The arms are asked what they proved. Every refusal this file authors is either reached by an arm's own run
 * or declared in UNARMED with the arm it owes; a declaration whose site an arm now reaches is refused, so the
 * table can only ever shrink, and an arm whose produced text no site authors says the reader and the writer
 * have come apart.
 */
export function armCoverage({ source, sets = [], declared = [] }) {
  const violations = [];
  const { sites, forwards, unreadable } = refusalSites(source);
  if (unreadable.length > 0) violations.push(`${unreadable.length} violations.push() call(s) in this file cannot be closed by this reader (${unreadable.join(', ')}) — a refusal it cannot find is a refusal it cannot count, and the index below is short by that much`);
  const reachedBy = (site) => sets.filter((s) => (s.violations ?? []).some((v) => segmentsMatch(v, site.segs))).map((s) => String(s.name).split(' ')[0]);
  const keys = new Map();
  for (const d of declared) {
    if (keys.has(d.key)) violations.push(`the unarmed table declares ${d.key} twice — two excuses for one refusal are two answers to one question`);
    keys.set(d.key, d);
    if (!sites.some((s) => s.key === d.key)) violations.push(`the unarmed table declares ${d.key}, which this file does not author — a record of a refusal that has gone outlives the refusal and miscounts the census`);
    if (typeof d.why !== 'string' || d.why.trim().length < 24) violations.push(`${d.key} is declared unarmed without a reason a reader can falsify (${JSON.stringify(String(d.why ?? '').slice(0, 40))}) — an excuse is not a disposition`);
    if (typeof d.next !== 'string' || d.next.trim().length < 12 || !/^arm [A-Za-z]+\d+/.test(d.next.trim())) violations.push(`${d.key} is declared unarmed without naming the arm that owes it (${JSON.stringify(String(d.next ?? '').slice(0, 40))}) — "later" is a permanent exclusion wearing a new word`);
  }
  const unaimed = sites.filter((s) => reachedBy(s).length === 0 && !keys.has(s.key));
  if (unaimed.length > 0) violations.push(`${unaimed.length} refusal(s) in this file rise on no plane and are declared by nobody: ${unaimed.map((s) => s.key).join(', ')} — an untested refusal is a sentence about what the census WOULD say, not a measurement that it does`);
  for (const site of sites) {
    const reached = reachedBy(site);
    if (reached.length > 0 && keys.has(site.key)) violations.push(`${site.key} is declared unarmed, but ${[...new Set(reached)].join(', ')} reaches it — the excuse no longer excuses; delete the row`);
  }
  const stranded = sets.filter((s) => (s.violations ?? []).length > 0 && !sites.some((site) => (s.violations ?? []).some((v) => segmentsMatch(v, site.segs)))).map((s) => String(s.name).split(' ')[0]);
  if (stranded.length > 0) violations.push(`arm(s) ${[...new Set(stranded)].join(', ')} produced a refusal this file does not author — the scanner and the writer disagree about what a red looks like, so neither index nor arm can be trusted`);
  return violations;
}

// The fixture plane quotes pushes as PUSH(; opening them here keeps the quote out of this file's own index.
const FX_PUSH = 'violations' + '.push(';
const fxOpened = (coverage) => ({ ...coverage, source: String(coverage.source).replaceAll('PUSH(', FX_PUSH) });

// ── the fixture arms: every refusal above, measured on a synthetic plane ─────────────────────────────
// The duration table, spelled once: the D arms rewrite this line rather than re-typing it, so a claim that moves
// moves in one place and every arm that aims at it follows.
const FX_HEADER = '| row | proof | measured on the authoring box |';
const FX_ROW = '| `verify:row` | `docs/evidence/x/row-proof.mjs` | 0.9 s on 2026-11-01 — the fixture row, timed on the plane the arms rewrite |';
// The hosted claim, spelled once: an address the plane resolves, the run that tested it, the day the runner
// stamped and the population it printed, so the E arms rewrite this line rather than re-typing it.
const FX_SHA = 'cafe001';
const FX_SHA2 = 'cafe002';
const FX_RUN = '40000000123';
const FX_DAY = '2026-10-30';
const FX_HOSTED = ['- Run `', FX_RUN, '` (sha `', FX_SHA, '`, ', FX_DAY, ') is the fixture host verdict: 2/2 green of a derived population of 2 · residue named: 0.'].join('');
const BASE = () => ({
  files: {
    'docs/evidence/x/row-proof.mjs': "import { h } from './helper.mjs';\nimport { f } from '../../../tools/ci/fx-lib.mjs';\n",
    'docs/evidence/x/excluded-proof.mjs': '// the service this proof needs is not on this plane\n',
    'docs/evidence/x/helper.mjs': "import { l } from './leaf.mjs';\n",
    'docs/evidence/x/leaf.mjs': '\n',
    'docs/evidence/x/swept-proof.mjs': '\n',
    'docs/evidence/x/tool.mjs': "const TOOL = 'tools/ci/fx-dormant.mjs';\nimport { t } from './tool-helper.mjs';\n",
    'docs/evidence/x/tool-helper.mjs': '\n',
    // Outside docs/evidence: the manifest names doors here too, and the module census deliberately does not
    // follow edges out of the evidence tree. The fixture plane carries them so the manifest arms have a tree,
    // and so the tools census has one witness per derived class (fx-lib reached by the row, fx-inner reached
    // through it, cdp behind the deferred browser door, fx-browser named by it, runner the runner itself).
    'tools/ci/runner.mjs': '// the fixture runner the proofs step walks\n',
    'tools/ci/fx-lib.mjs': "import { i } from './fx-inner.mjs';\n",
    'tools/ci/fx-inner.mjs': '\n',
    'tools/ci/fx-dormant.mjs': '// the fixture repairer nothing imports\n',
    'tools/harness/cdp.mjs': 'export const launch = async () => ({});\n',
    'tools/harness/fx-browser.mjs': "import { launch } from './cdp.mjs';\nconst url = 'http://127.0.0.1:3210';\n",
    'services/nexus-api/pom.xml': '<project/>\n',
  },
  // The workflow as CI would check it out: run lines inline and as a block scalar, one comment that quotes the
  // maven line so the M6 arm can prove a quote is not a test run.
  workflow: [
    'jobs:',
    '  quality:',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - name: Install',
    '        run: npm ci || npm install',
    '      - name: Warm the Maven repository',
    '        # mvn -B -q -f services/nexus-api/pom.xml test is prose about a lifecycle, not the lifecycle',
    '        run: mvn -B -q -f services/nexus-api/pom.xml test',
    '      - name: ADR index integrity',
    '        run: |',
    '          shopt -s nullglob',
    '          for f in docs/decisions/[0-9]*.md; do',
    '            echo "$f"',
    '          done',
    '      - name: Evidence proofs',
    '        run: npm run verify:runner',
    '',
  ].join('\n'),
  manifest: [
    {
      name: 'verify:runner',
      class: 'runner',
      run: 'npm run verify:runner',
      why: 'the fixture door the proofs step calls, declared so the control plane has a witness for the runner class',
    },
    {
      name: 'verify:svc',
      class: 'covered',
      run: 'npm run verify:svc',
      tool: 'mvn',
      subject: 'services/nexus-api/pom.xml',
      why: 'the fixture coverage claim: the workflow runs the same pom through its own mvn line, so this name is a person\'s door with a build behind it',
    },
    {
      name: 'verify:browser',
      class: 'deferred',
      run: 'npm run verify:browser',
      reach: 'tools/harness/cdp.mjs',
      measured: '2 lines; navigates 127.0.0.1:3210, a URL this plane never starts, counted off the bytes of the module the entry names',
      blocker: 'a browser binary and a served app, neither of which the fixture workflow installs or starts before the proofs step runs',
      next: 'start its own app the way the shipped publish proof does and move under docs/evidence, which makes PROOF_COMMAND derive it as a row',
      why: 'a real-browser walk with an unstalled prerequisite is a human-run measurement, and the fixture plane needs one to arm against',
    },
  ],
  // One standby witness, so every refusal the tools census raises is aimed at a fixture rather than at a sentence.
  toolsStandby: [
    {
      path: 'tools/ci/fx-dormant.mjs',
      reachedBy: 'docs/evidence/x/tool.mjs',
      measured: '1 line; the fixture repairer, named as a string value by the fixture tool and imported by nothing on this plane',
      blocker: 'a fixture prerequisite the fixture workflow does not install, stated so the arms have something to refuse',
      next: 'wire the fixture row that imports it, which derives it as reached and deletes this fixture entry',
      why: 'the fixture plane needs a standby witness for the four refusals this class answers',
    },
  ],
  // The proof's own header, on this plane: one marked ROSTER line and the prose around it. The numbers are the same
  // list the real header states, because the arms ARE this list — so S1→S7 drift the marker, not a copy of it.
  source: [
    '// fixture header — the record this file keeps while the ledger files sit in another lane',
    '// ROSTER 132 arms in 12 families — A19 · R10 · M25 · T17 · N7 · X8 · S7 · C8 · D14 · E10 · F2 · G5',
    '// end fixture header',
  ].join('\n'),
  // A synthetic proof for the coverage grader: three refusations, two reached by a named arm, one declared.
  // The pushes are written PUSH( and opened by fxOpened() because an index that read a QUOTED push in this
  // file as an authored refusal would count the census twice — once for the code and once for the fixture.
  coverage: fxOpened({
    source: [
      'function fxRows({ rows, late }) {',
      '  const violations = [];',
      "  if (!rows) PUSH('no rows were supplied, so the fixture grader measured nothing at all');",
      '  if (late) PUSH(`the fixture row ${late} arrived after the census closed and no reader can re-walk it`);',
      '  if (rows === "many") PUSH(`the fixture census closed at ${rows} over nothing anyone can re-run`);',
      '  return violations;',
      '}',
    ].join('\n'),
    sets: [
      { name: 'K1 the missing rows', violations: ['no rows were supplied, so the fixture grader measured nothing at all'] },
      { name: 'K2 a row after the close', violations: ['the fixture row late arrived after the census closed and no reader can re-walk it'] },
    ],
    declared: [
      { key: 'fxRows#3', why: 'the synthetic plane closes over nothing until an arm gives it a row to close on', next: 'arm K3 the fixture census that closes over nothing' },
    ],
  }),
  // The README is part of the plane: it restates the counts above in the same shapes the real file uses,
  // so the control arm proves the reader agrees with a correct table before any arm drifts one number.
  readme: [
    '| class | count at this ref | how it is decided |',
    '| --- | --- | --- |',
    '| ROW | **2** (1 run + 1 excluded) | a verify:* script, synthetic on this plane |',
    '| HELPER | **3** | the import closure of the fixture bytes |',
    '| SWEPT | **1** | the fixture sweep population |',
    '| TOOL | **1** | the fixture declared tool |',
    '| DEFERRED | **0** | none on this plane |',
    '',
    'The census below gives every one of the **7** tracked modules a disposition, and the derived population is',
    '**1 running rows + 1 excluded by name** at this ref.',
    '',
    '**132 fixture arms** prove each refusal on a synthetic plane — the nineteen above, ten that drift one README',
    "number each, twenty-five that dispose the manifest's blind side, seventeen that dispose the tools corpus",
    "behind it, seven that grade the numbers those deferrals state, eight that recompute the roster this sentence",
    'lives in, seven that grade the marker this file carries in its own header, eight that grade the arms list',
    'itself, fourteen that date the measurements the authoring box left behind, ten that re-derive the commits a',
    'hosted claim names, two that refuse a run number the paragraph writing it leaves without an address, five',
    'that grade an address the word sha never names;',
    'the prose-import arm proves',
    "the tokenizer is the sweep's, not a byte regex.",
    '',
    FX_HOSTED,
    '',
    // The duration table, dated per row (v625): the fixture plane needs one honest claim so every refusal this
    // reader raises rises from a patch rather than from a table that was never there.
    FX_HEADER,
    '| --- | --- | --- |',
    FX_ROW,
  ].join('\n'),
  // When the fixture bytes last landed, and when this census runs: mid-day epochs, so the local calendar day
  // a reader compares is the same day on every box the arms run on.
  committedAt: { 'docs/evidence/x/row-proof.mjs': { at: 1793361600, ref: 'cafe123' } },
  now: 1793926800,
  // The addresses the fixture README resolves: the claim names the first, and the second is held so the arm
  // that aims at a run anchored to two commits has an address that answers on its own.
  refs: {
    cafe001: { at: Math.floor(Date.parse('2026-10-30T12:00:00Z') / 1000), count: 1, ancestor: true, rows: 2 },
    cafe002: { at: Math.floor(Date.parse('2026-10-30T12:00:00Z') / 1000), count: 1, ancestor: true, rows: 2 },
  },
  scripts: {
    'verify:row': 'node docs/evidence/x/row-proof.mjs',
    'verify:excluded': 'node docs/evidence/x/excluded-proof.mjs',
    'verify:runner': 'node tools/ci/runner.mjs',
    'verify:svc': 'mvn -B test -f services/nexus-api/pom.xml',
    'verify:browser': 'node tools/harness/fx-browser.mjs',
  },
  excluded: [{ file: 'docs/evidence/x/excluded-proof.mjs', needs: 'a service this synthetic plane does not have' }],
  roster: [
    {
      file: 'docs/evidence/x/tool.mjs',
      class: 'tool',
      run: 'node docs/evidence/x/tool.mjs',
      why: 'a human-run tool, declared here so the synthetic plane has a witness for the tool class',
    },
  ],
  swept: ['docs/evidence/x/swept-proof.mjs'],
});

const ARMS = [
  ['A0 control', () => {}, (r) => {
    assert.deepEqual(r.violations, [], `the control plane is red: ${r.violations.join(' | ')}`);
    assert.deepEqual(r.unclassified, []);
    assert.deepEqual(r.counts, { row: 2, helper: 3, swept: 1, tool: 1, deferred: 0, unclassified: 0 }, `counts: ${JSON.stringify(r.counts)}`);
    assert.ok(r.helpers.has('docs/evidence/x/leaf.mjs'), 'a helper of a helper is a helper');
    assert.deepEqual(r.manifest.counts, { names: 5, row: 2, runner: 1, covered: 1, deferred: 1, undispositioned: 0 }, `manifest counts: ${JSON.stringify(r.manifest.counts)}`);
    assert.equal(r.manifest.coverage.get('verify:svc').length, 1, 'the coverage claim resolves to exactly one workflow command line');
    assert.deepEqual(r.tools.counts, { total: 6, runner: 1, reached: 2, named: 1, behind: 1, standby: 1, unreached: 0 }, `tools counts: ${JSON.stringify(r.tools.counts)}`);
    assert.equal(r.tools.classes.get('tools/ci/fx-inner.mjs'), 'reached', 'reach is a closure, not a one-hop lookup');
    assert.equal(r.tools.classes.get('tools/harness/cdp.mjs'), 'behind', 'a helper of a deferred door is derived, never declared');
  }],
  ['A1 an unclassified module', (f) => { f.files['docs/evidence/x/stray.mjs'] = ''; }, (r) => {
    assert.ok(r.unclassified.includes('docs/evidence/x/stray.mjs'), `stray: ${JSON.stringify(r.unclassified)}`);
  }],
  ['A2 a helper nothing imports', (f) => { f.files['docs/evidence/x/row-proof.mjs'] = '// the import is gone\n'; }, (r) => {
    assert.ok(r.unclassified.includes('docs/evidence/x/helper.mjs') && r.unclassified.includes('docs/evidence/x/leaf.mjs'), `orphans: ${JSON.stringify(r.unclassified)}`);
  }],
  ['A3 a roster entry the commit does not own', (f) => {
    f.roster.push({ file: 'docs/evidence/x/ghost.mjs', class: 'tool', run: 'node docs/evidence/x/ghost.mjs', why: 'a declaration whose file was deleted, which must not outlive it silently' });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('docs/evidence/x/ghost.mjs') && v.includes('does not own')), r.violations.join(' | '));
  }],
  ['A4 a reason a reader cannot falsify', (f) => { f.roster[0].why = 'because'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('without a reason a reader can falsify')), r.violations.join(' | '));
  }],
  ['A5 a declaration shadowing a row', (f) => {
    f.roster.push({ file: 'docs/evidence/x/row-proof.mjs', class: 'tool', run: 'node docs/evidence/x/row-proof.mjs', why: 'a row wearing a tool label would leave the build one row smaller than its scripts say' });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('docs/evidence/x/row-proof.mjs') && v.includes('cannot shadow')), r.violations.join(' | '));
  }],
  ['A6 a row target the commit does not own', (f) => { f.tracked = Object.keys(f.files).filter((p) => p !== 'docs/evidence/x/row-proof.mjs'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:row') && v.includes('does not own')), r.violations.join(' | '));
  }],
  ['A7 a proof moved out of the swept population', (f) => { f.swept = []; }, (r) => {
    assert.ok(r.unclassified.includes('docs/evidence/x/swept-proof.mjs'), `swept dropped: ${JSON.stringify(r.unclassified)}`);
  }],
  ['A8 a deferral with no next repair', (f) => {
    f.roster.push({
      file: 'docs/evidence/x/swept-proof.mjs', // the file this plane's sweep population starts with; the arm empties that population so the entry stays a deferral
      class: 'deferred',
      run: 'node docs/evidence/x/swept-proof.mjs',
      why: 'a deferred entry exists to name what would wire it, and this arm removes exactly that sentence',
      measured: '1 line of bytes; 1.0 s on a synthetic plane, 2026-10-28',
      blocker: 'the sandbox prerequisite is named so the arm reaches the next-repair refusal instead',
      next: '',
    });
    f.swept = []; // keep the entry a deferral rather than a derived swept row
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('docs/evidence/x/swept-proof.mjs') && v.includes('without naming the repair')), r.violations.join(' | '));
  }],
  ['A9 a run line that names another file', (f) => { f.roster[0].run = 'node docs/evidence/x/toolz.mjs'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('does not name its own file')), r.violations.join(' | '));
  }],
  ['A10 a file declared twice', (f) => { f.roster.push({ ...f.roster[0] }); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('twice')), r.violations.join(' | '));
  }],
  ['A11 an import the commit does not own', (f) => { f.files['docs/evidence/x/row-proof.mjs'] = "import { m } from './missing.mjs';\n"; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('missing.mjs') && v.includes('does not own')), r.violations.join(' | '));
  }],
  ['A12 an import written only in prose', (f) => {
    f.files['docs/evidence/x/row-proof.mjs'] = "// import { g } from './ghost.mjs'\nconst s = \"import { g } from './ghost.mjs'\";\n";
  }, (r) => {
    assert.ok(!r.violations.some((v) => v.includes('ghost.mjs')), `prose became an edge: ${r.violations.join(' | ')}`);
    assert.ok(r.unclassified.includes('docs/evidence/x/helper.mjs'), 'the real import was removed, so the helper must fall out of the closure');
  }],
  ['A13 an exclusion that retires no row', (f) => {
    f.excluded.push({ file: 'docs/evidence/x/leaf.mjs', needs: 'a service this synthetic plane does not have' });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('docs/evidence/x/leaf.mjs') && v.includes('not a row')), r.violations.join(' | '));
  }],
  ['A14 a declaration of a class the census derives', (f) => { f.roster[0].class = 'swept'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('the roster gives docs/evidence/x/tool.mjs the class "swept"') && v.includes('are DERIVED')), `declarable class: ${r.violations.join(' | ')}`);
  }],
  ['A15 a deferral that states no measurement', (f) => {
    f.roster.push({
      file: 'docs/evidence/x/swept-proof.mjs',
      class: 'deferred',
      run: 'node docs/evidence/x/swept-proof.mjs',
      why: 'a deferral is a measurement, a blocker and a next; this arm takes the first of the three away',
      measured: '',
      blocker: 'the prerequisite is named in full, so the refusal rises on the missing measurement alone',
      next: 're-read the count off the bytes and correct this field, which is what the refusal asks for',
    });
    f.swept = []; // keep the entry a deferral rather than a derived swept row
    f.readme = f.readme.replace('| SWEPT | **1**', '| SWEPT | **0**').replace('| DEFERRED | **0**', '| DEFERRED | **1**');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('is deferred without a measurement')), `no measurement: ${r.violations.join(' | ')}`);
  }],
  ['A16 a deferral that names no sandbox prerequisite', (f) => {
    f.roster.push({
      file: 'docs/evidence/x/swept-proof.mjs',
      class: 'deferred',
      run: 'node docs/evidence/x/swept-proof.mjs',
      why: 'a deferral is a measurement, a blocker and a next; this arm takes the blocker away',
      measured: '1 line; 1.0 s on a synthetic plane, 2026-10-28',
      blocker: '',
      next: 'name the prerequisite the sandbox does not stand up, which is what the refusal asks for',
    });
    f.swept = [];
    f.readme = f.readme.replace('| SWEPT | **1**', '| SWEPT | **0**').replace('| DEFERRED | **0**', '| DEFERRED | **1**');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('is deferred without naming the sandbox prerequisite')), `no blocker: ${r.violations.join(' | ')}`);
  }],
  ['A17 a population that lists one module twice', (f) => {
    // The census reads the listing, not a set, so a path arriving twice from git is this reader's own bug — and
    // the closure arithmetic is the only place that bug can surface.
    f.tracked = [...Object.keys(f.files).filter((p) => p.startsWith('docs/evidence/')), 'docs/evidence/x/leaf.mjs'];
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('the census closes at 7 over a population of 8')), `closure arithmetic: ${r.violations.join(' | ')}`);
  }],
  ['A18 a census with no README to check its counts against', (f) => { f.readme = ''; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('no README was supplied')), `missing README: ${r.violations.join(' | ')}`);
  }],
  ['R1 a README ROW total that drifted', (f) => { f.readme = f.readme.replace('| ROW | **2**', '| ROW | **3**'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes("the README's ROW row says 3 rows")), r.violations.join(' | '));
  }],
  ['R2 a README run/residue split that drifted', (f) => {
    f.readme = f.readme.replace('(1 run + 1 excluded)', '(2 run + 0 excluded)');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('says 2 run + 0 excluded')), r.violations.join(' | '));
  }],
  ['R3 a README HELPER count that drifted', (f) => { f.readme = f.readme.replace('| HELPER | **3**', '| HELPER | **4**'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('says 4 HELPER')), r.violations.join(' | '));
  }],
  ['R4 a README class row that vanished', (f) => {
    f.readme = f.readme.replace('| SWEPT | **1** | the fixture sweep population |', '');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('no readable SWEPT row')), r.violations.join(' | '));
  }],
  ['R5 a README tracked-prose count that drifted', (f) => {
    f.readme = f.readme.replace('**7** tracked modules', '**8** tracked modules');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('says 8 tracked modules')), r.violations.join(' | '));
  }],
  ['R6 a README "at this ref" split that drifted', (f) => {
    f.readme = f.readme.replace('**1 running rows + 1 excluded by name**', '**2 running rows + 0 excluded by name**');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('says 2 running + 0 excluded')), r.violations.join(' | '));
  }],
  ['R7 a README whose ROW row is written so nothing reads it', (f) => {
    f.readme = f.readme.replace('| ROW | **2** (1 run + 1 excluded) | a verify:* script, synthetic on this plane |', '| ROW | rows, as they always were | the census prints them |');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('the README has no readable ROW row')), `unreadable ROW row: ${r.violations.join(' | ')}`);
  }],
  ['R8 a README ROW cell that stopped stating its split', (f) => {
    f.readme = f.readme.replace('(1 run + 1 excluded)', '(one run, one excluded)');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('ROW cell no longer states "(N run + M excluded)"')), `missing split: ${r.violations.join(' | ')}`);
  }],
  ['R9 a README tracked-modules sentence reshaped', (f) => {
    f.readme = f.readme.replace('every one of the **7** tracked modules', 'all seven of the tracked modules');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('"tracked modules" sentence is missing or reshaped')), `reshaped tracked sentence: ${r.violations.join(' | ')}`);
  }],
  ['R10 a README "at this ref" sentence reshaped', (f) => {
    f.readme = f.readme.replace('**1 running rows + 1 excluded by name** at this ref', 'one running row and one excluded by name here');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('"running rows ... at this ref" sentence is missing or reshaped')), `reshaped at-ref sentence: ${r.violations.join(' | ')}`);
  }],
  // ── the manifest arms: every `verify:*` name owes a disposition ──────────────────────────────────────
  ['M1 a new verify:* script nobody disposed', (f) => { f.scripts['verify:ghost'] = 'node tools/harness/fx-browser.mjs'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:ghost') && v.includes('UNDISPOSITIONED')), `ghost: ${r.violations.join(' | ')}`);
    assert.equal(r.manifest.counts.undispositioned, 1, `undispositioned: ${JSON.stringify(r.manifest.counts)}`);
  }],
  ['M2 a disposition whose script is gone', (f) => { delete f.scripts['verify:svc']; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:svc') && v.includes('the manifest no longer holds')), `stale: ${r.violations.join(' | ')}`);
  }],
  ['M3 a disposition shadowing a derived row', (f) => {
    f.manifest.push({
      name: 'verify:row',
      class: 'deferred',
      run: 'npm run verify:row',
      reach: 'tools/harness/cdp.mjs',
      measured: '2 lines; a row dressed as a deferral, which would take a build door out of the build with a sentence',
      blocker: 'nothing: this fixture entry exists to be refused, because the class it claims is DERIVED from the manifest command',
      next: 'delete the entry, and the census reads the row off package.json the way the runner does',
      why: 'a declaration cannot retire a derived row, and this arm is the witness that the census says so',
    });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:row') && v.includes('DERIVES it as a row')), `shadow: ${r.violations.join(' | ')}`);
  }],
  ['M4 the runner the workflow stopped calling', (f) => {
    f.workflow = f.workflow.replace('        run: npm run verify:runner', '        run: echo the proofs step moved');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:runner') && v.includes('no run line')), `runner gone: ${r.violations.join(' | ')}`);
  }],
  ['M5 coverage claimed from a comment', (f) => {
    f.workflow = f.workflow.replace('        run: mvn -B -q -f services/nexus-api/pom.xml test', '        echo "a step that grades nothing here"');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:svc') && v.includes('no run line in')), `prose coverage: ${r.violations.join(' | ')}`);
    assert.ok(!r.manifest.coverage.has('verify:svc'), 'the coverage map must not hold a claim the workflow cannot answer');
  }],
  ['M6 a deferral whose reach is only prose', (f) => {
    f.files['tools/harness/fx-browser.mjs'] = "// import { launch } from './cdp.mjs';\nconst url = \"./cdp.mjs\"; // the address it asks for is 127.0.0.1:3210\n";
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser') && v.includes('does not IMPORT it outside its comments')), `prose reach: ${r.violations.join(' | ')}`);
  }],
  ['M7 a deferral with no next repair', (f) => { f.manifest[2].next = ''; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser') && v.includes('without a next')), `open-ended deferral: ${r.violations.join(' | ')}`);
  }],
  ['M8 a manifest target the commit does not own', (f) => { delete f.files['tools/ci/runner.mjs']; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:runner') && v.includes('the commit does not own')), `dangling door: ${r.violations.join(' | ')}`);
  }],
  ['M9 a run line that is not the door', (f) => { f.manifest[0].run = 'npm run verify:runners'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:runner') && v.includes('npm run verify:runner`')), `wrong run line: ${r.violations.join(' | ')}`);
  }],
  ['M10 a workflow with no commands at all', (f) => { f.workflow = ''; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('found 0 run commands')), `empty reader: ${r.violations.join(' | ')}`);
  }],
  ['M11 one script disposed twice', (f) => { f.manifest.push({ ...f.manifest[0] }); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:runner') && v.includes('twice')), `duplicate: ${r.violations.join(' | ')}`);
  }],
  ['M12 the manifest census with no workflow to read', (f) => { f.workflow = null; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('no workflow text was supplied')), `no workflow: ${r.violations.join(' | ')}`);
  }],
  ['M13 a disposition that declares the class the census derives', (f) => { f.manifest[0].class = 'row'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:runner is disposed with the class "row"') && v.includes('row is DERIVED')), `undeclarable class: ${r.violations.join(' | ')}`);
  }],
  ['M14 a disposition whose reason cannot be re-read', (f) => { f.manifest[0].why = 'because'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:runner is disposed without a reason a reader can falsify')), `unfalsifiable why: ${r.violations.join(' | ')}`);
  }],
  ['M15 a runner whose command is a shell line rather than a door', (f) => {
    f.scripts['verify:runner'] = 'npm ci && node tools/ci/runner.mjs';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:runner is disposed as the runner, yet its command') && v.includes('is not one node call')), `runner that is not one call: ${r.violations.join(' | ')}`);
  }],
  ['M16 a runner that duplicates a derived row', (f) => {
    f.files['docs/evidence/x/door-proof.mjs'] = '// the fixture door that is already a row\n';
    f.scripts['verify:runner'] = 'node docs/evidence/x/door-proof.mjs';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('while its target docs/evidence/x/door-proof.mjs sits under docs/evidence/') && v.includes('not a door')), `runner duplicating a row: ${r.violations.join(' | ')}`);
  }],
  ['M17 a coverage claim without a subject', (f) => { f.manifest[1].subject = ''; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('disposed as covered without naming the subject path')), `no subject: ${r.violations.join(' | ')}`);
  }],
  ['M18 a coverage claim without a tool', (f) => { f.manifest[1].tool = ''; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('disposed as covered without naming the tool')), `no tool: ${r.violations.join(' | ')}`);
  }],
  ['M19 a coverage claim about a path no clone holds', (f) => {
    f.manifest[1].subject = 'services/nexus-api/ghost.xml';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:svc claims coverage of services/nexus-api/ghost.xml, which the commit does not own')), `subject outside the commit: ${r.violations.join(' | ')}`);
  }],
  ['M20 a coverage claim its own command does not make', (f) => {
    f.scripts['verify:svc'] = 'mvn -B test';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes("verify:svc's own command \"mvn -B test\" does not name the subject services/nexus-api/pom.xml")), `command that does not name its subject: ${r.violations.join(' | ')}`);
  }],
  ['M21 a deferral that blames a prerequisite of a command rather than a file', (f) => {
    f.scripts['verify:browser'] = 'bash tools/harness/start.sh';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser is disposed as deferred, yet its command') && v.includes('it must name one')), `deferral on a command: ${r.violations.join(' | ')}`);
  }],
  ['M22 a deferral on a door that exists only on the authoring box', (f) => {
    f.scripts['verify:browser'] = 'node tools/harness/fx-ghost.mjs';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser defers on tools/harness/fx-ghost.mjs, which the commit does not own')), `deferral on an unowned door: ${r.violations.join(' | ')}`);
  }],
  ['M23 a deferral with a sentence where its dependency belongs', (f) => { delete f.manifest[2].reach; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser is deferred without naming the module its own code imports')), `deferral with no reach: ${r.violations.join(' | ')}`);
  }],
  ['M24 a manifest that closes at a number it did not reach', (f) => { f.manifest[0].class = 'observed'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('the manifest closes at 4 over 5 verify:* names')), `manifest closure: ${r.violations.join(' | ')}`);
  }],
  ['M25 a door attributed to the step that closes the block above it', (f) => {
    f.workflow = f.workflow.replace('        run: npm run verify:runner', '        run: |\n          npm run verify:runner');
  }, (r) => {
    assert.equal(r.manifest.runnerSteps.get('verify:runner'), 'Evidence proofs', `runner carrier: ${JSON.stringify([...r.manifest.runnerSteps])}`);
    assert.ok(r.manifest.commands.includes('npm run verify:runner'), `the block spelling must not lose the door: ${JSON.stringify(r.manifest.commands)}`);
    assert.ok(!r.violations.some((v) => v.includes('verify:runner is disposed as a runner')), `the reshaped call must stay a door: ${r.violations.join(' | ')}`);
  }],
  ['T1 a tools module nobody reaches', (f) => { f.files['tools/ci/fx-stray.mjs'] = '\n'; }, (r) => {
    assert.ok(r.tools.unreached.includes('tools/ci/fx-stray.mjs'), `stray: ${JSON.stringify(r.tools.unreached)}`);
    assert.ok(r.violations.some((v) => v.includes('fx-stray.mjs') && v.includes('UNREACHED')), `stray refusal: ${r.violations.join(' | ')}`);
  }],
  ['T2 a standby witness whose path sits only in prose', (f) => {
    f.files['docs/evidence/x/tool.mjs'] = "// tools/ci/fx-dormant.mjs is the repairer\nimport { t } from './tool-helper.mjs';\n";
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-dormant.mjs') && v.includes('prose is not a reach')), `prose witness: ${r.violations.join(' | ')}`);
  }],
  ['T3 a standby shadowing a derived class', (f) => {
    f.files['docs/evidence/x/tool.mjs'] = "const TOOL = 'tools/ci/fx-dormant.mjs';\nconst LIB = 'tools/ci/fx-lib.mjs';\nimport { t } from './tool-helper.mjs';\n";
    f.toolsStandby.push({
      path: 'tools/ci/fx-lib.mjs',
      reachedBy: 'docs/evidence/x/tool.mjs',
      measured: '1 line; a fixture module the fixture row already imports, declared standby here only to aim at the shadow refusal',
      blocker: 'none — the whole point of this fixture entry is that a derived class cannot be re-declared away',
      next: 'delete this entry, which is what the refusal asks for the day the door really stops running',
      why: 'the shadow arm needs a well-formed declaration so that only the shadowing itself is red',
    });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-lib.mjs') && v.includes('DERIVES it as reached')), `shadow: ${r.violations.join(' | ')}`);
  }],
  ['T4 a standby whose module the commit does not own', (f) => { f.toolsStandby[0].path = 'tools/ci/fx-ghost.mjs'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-ghost.mjs') && v.includes('does not own')), `stale standby: ${r.violations.join(' | ')}`);
  }],
  ['T5 a standby with no next repair', (f) => { f.toolsStandby[0].next = 'later'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-dormant.mjs') && v.includes('without a next')), `open-ended standby: ${r.violations.join(' | ')}`);
  }],
  ['T6 an edge that points away from the rows', (f) => {
    f.files['docs/evidence/x/row-proof.mjs'] = "import { h } from './helper.mjs';\n";
    f.files['tools/ci/fx-inner.mjs'] = "import { l } from './fx-lib.mjs';\n";
  }, (r) => {
    assert.ok(r.tools.unreached.includes('tools/ci/fx-inner.mjs') && r.tools.unreached.includes('tools/ci/fx-lib.mjs'), `reversed: ${JSON.stringify(r.tools.unreached)}`);
    assert.equal(r.tools.counts.reached, 0, `a reverse edge must lift nothing: ${JSON.stringify(r.tools.counts)}`);
  }],
  ['T7 an undispositioned door reddens both censuses', (f) => { f.manifest = f.manifest.filter((e) => e.name !== 'verify:browser'); }, (r) => {
    assert.ok(r.manifest.undispositioned.includes('verify:browser'), `manifest: ${JSON.stringify(r.manifest.undispositioned)}`);
    assert.ok(r.tools.unreached.includes('tools/harness/fx-browser.mjs'), `tools: ${JSON.stringify(r.tools.unreached)}`);
  }],
  ['T8 a live import moves a module from behind to reached', (f) => {
    f.files['docs/evidence/x/row-proof.mjs'] = "import { h } from './helper.mjs';\nimport { f } from '../../../tools/ci/fx-lib.mjs';\nimport { launch } from '../../../tools/harness/cdp.mjs';\n";
  }, (r) => {
    assert.equal(r.tools.classes.get('tools/harness/cdp.mjs'), 'reached', `cdp: ${r.tools.classes.get('tools/harness/cdp.mjs')}`);
    assert.deepEqual(r.tools.behind, [], `behind should be empty: ${JSON.stringify(r.tools.behind)}`);
    assert.equal(r.tools.counts.reached, 3, `three tools modules are now live: ${JSON.stringify(r.tools.counts)}`);
  }],
  ['T9 one module declared standby twice', (f) => { f.toolsStandby.push({ ...f.toolsStandby[0] }); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-dormant.mjs') && v.includes('twice')), `duplicate: ${r.violations.join(' | ')}`);
  }],
  ['T10 a commented import buys no reach', (f) => {
    f.files['tools/ci/fx-comment.mjs'] = '\n';
    f.files['docs/evidence/x/row-proof.mjs'] = "import { h } from './helper.mjs';\n// import { c } from '../../../tools/ci/fx-comment.mjs';\n";
  }, (r) => {
    assert.ok(r.tools.unreached.includes('tools/ci/fx-comment.mjs'), `commented edge: ${JSON.stringify(r.tools.unreached)}`);
  }],
  ['T11 a replacement that is not a row', (f) => {
    f.files['tools/ci/fx-old.mjs'] = '\n';
    f.toolsStandby.push({
      path: 'tools/ci/fx-old.mjs',
      replacedBy: 'docs/evidence/x/swept-proof.mjs',
      measured: '1 line; a fixture driver replaced, it claims, by a proof the build never walks — the claim this refusal exists to test',
      blocker: 'a prerequisite this fixture plane does not have, named so the entry looks complete except for its witness',
      next: 'name the row that really grades the face, or wire this driver, which is what the refusal asks for',
      why: 'a replacement nobody runs is not a replacement, and this fixture proves the census says so',
    });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-old.mjs') && v.includes('derives no row')), `false replacement: ${r.violations.join(' | ')}`);
  }],
  ['T12 a standby with no witness at all', (f) => { delete f.toolsStandby[0].reachedBy; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-dormant.mjs') && v.includes('no witness')), `unwitnessed: ${r.violations.join(' | ')}`);
  }],
  ['T13 the tools census with no index to read', (f) => { f.index = []; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('no index was supplied to the tools census')), `empty index: ${r.violations.join(' | ')}`);
  }],
  ['T14 a standby that stands down an evidence module', (f) => { f.toolsStandby[0].path = 'docs/evidence/x/tool.mjs'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('TOOLS_STANDBY declares docs/evidence/x/tool.mjs, which is not a runnable module under tools/')), `standby outside the corpus: ${r.violations.join(' | ')}`);
  }],
  ['T15 a standby blaming a witness no clone holds', (f) => { f.toolsStandby[0].reachedBy = 'docs/evidence/x/ghost.mjs'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('blames docs/evidence/x/ghost.mjs, which the commit does not own')), `witness outside the commit: ${r.violations.join(' | ')}`);
  }],
  ['T16 a replacement the commit never owned', (f) => { f.toolsStandby[0].replacedBy = 'tools/ci/fx-ghost.mjs'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('claims tools/ci/fx-ghost.mjs grades the same face, and the commit does not own that file')), `replacement outside the commit: ${r.violations.join(' | ')}`);
  }],
  ['T17 a tools census that closes at a number it did not reach', (f) => {
    f.index = [...Object.keys(f.files), 'tools/ci/fx-inner.mjs'];
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('the tools census closes at 6 over 7 modules under tools/')), `tools closure: ${r.violations.join(' | ')}`);
  }],
  // ── the measurement arms: a deferral's numbers are graded against the bytes it blames (v609) ──────────
  ['N1 a manifest deferral whose line count drifted', (f) => {
    f.manifest[2].measured = '3 lines; navigates 127.0.0.1:3210, a URL this plane never starts, counted off the bytes of the module the entry names';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser') && v.includes('reads 3 line(s); this census counts 2')), `stale line count: ${r.violations.join(' | ')}`);
  }],
  ['N2 a manifest deferral that blames an address the module never asks for', (f) => {
    f.manifest[2].measured = '2 lines; navigates 127.0.0.1:9999, a port no app on this plane binds, counted off the bytes of the module the entry names';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser') && v.includes('127.0.0.1:9999') && v.includes('is not in its bytes')), `false address: ${r.violations.join(' | ')}`);
  }],
  ['N3 a standby whose line count drifted', (f) => {
    f.toolsStandby[0].measured = '2 lines; the fixture repairer, named as a string value by the fixture tool and imported by nothing on this plane';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-dormant.mjs (standby)') && v.includes('reads 2 line(s); this census counts 1')), `stale standby: ${r.violations.join(' | ')}`);
  }],
  ['N4 a deferral that states numbers about a module this box cannot read', (f) => {
    delete f.files['tools/ci/fx-dormant.mjs'];
    f.index = Object.keys(f.files).concat('tools/ci/fx-dormant.mjs');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fx-dormant.mjs') && v.includes('owns but this box cannot read')), `unreadable blame: ${r.violations.join(' | ')}`);
  }],
  ['N5 a roster deferral whose line count drifted', (f) => {
    f.roster.push({
      file: 'docs/evidence/x/swept-proof.mjs',
      class: 'deferred',
      run: 'node docs/evidence/x/swept-proof.mjs',
      why: 'a deferral whose own measurement is one line out of date, which is the rot this arm exists to refuse',
      measured: '9 lines; 1.0 s on a synthetic plane, 2026-10-28',
      blocker: 'a sandbox prerequisite named in full so that only the stale number in its measurement is red',
      next: 're-read the count off the bytes and correct this field, which is what the refusal asks the writer to do',
    });
    f.swept = []; // keep the entry a deferral rather than a derived swept row
    f.readme = f.readme.replace('| SWEPT | **1**', '| SWEPT | **0**').replace('| DEFERRED | **0**', '| DEFERRED | **1**');
  }, (r) => {
    assert.deepEqual(r.violations.filter((v) => !v.includes('reads 9 line(s)')), [], `N5 was meant to raise one refusal, not ${JSON.stringify(r.violations)}`);
    assert.ok(r.violations.some((v) => v.includes('swept-proof.mjs (roster deferral)') && v.includes('reads 9 line(s); this census counts 1')), `stale roster: ${r.violations.join(' | ')}`);
  }],
  ['N6 a count that is true of the launcher rather than the door', (f) => {
    f.manifest[2].measured = '1 line; navigates 127.0.0.1:3210, a URL this plane never starts — the count read off the launcher this door imports, not off the door itself';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser') && v.includes('reads 1 line(s); this census counts 2') && v.includes('not one it mentions')), `wrong module: ${r.violations.join(' | ')}`);
  }],
  ['N7 a measured field that states nothing a reader can re-read', (f) => {
    f.manifest[2].measured = 'it is slow on a real browser and needs a served app, which is the whole reason this door is not a row on this plane';
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('verify:browser') && v.includes('no line count and no served address')), `unre-readable: ${r.violations.join(' | ')}`);
  }],
  // ── the roster arms: the README's own count of these arms is recomputed from the list, not copied (v610) ──
  ['X1 the fixture-arms total the README states has drifted', (f) => { f.readme = f.readme.replace('**132 fixture arms**', '**92 fixture arms**'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('says 92 fixture arms; this census runs 132')), `stale total: ${r.violations.join(' | ')}`);
    assert.ok(r.violations.some((v) => v.includes("add to 132 against its own total of 92")), `arithmetic: ${r.violations.join(' | ')}`);
  }],
  ['X2 one family number in the breakdown has drifted', (f) => { f.readme = f.readme.replace('twenty-five that dispose', 'twenty-four that dispose'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('arm family 3 (M)') && v.includes('i.e. 24') && v.includes('counts 25 arms named M*')), `drifted family: ${r.violations.join(' | ')}`);
  }],
  ['X3 a family the breakdown dropped', (f) => {
    // \\s+ rather than a space: the sentence is wrapped, and an anchor that only matches one wrapping is an arm
    // that goes quietly red when a reader asks for a shorter line.
    f.readme = f.readme.replace(/, twenty-five\s+that\s+dispose\s+the\s+manifest's\s+blind\s+side/, '');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes("names 11 families; the arms list defines 12")), `dropped family: ${r.violations.join(' | ')}`);
  }],
  ['X4 a breakdown with no end the reader can take on trust', (f) => {
    f.readme = f.readme.replace('the prose-import arm proves', 'and the tokenizer is the sweep\'s, which proves');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('no bound this reader can take on trust')), `unbounded breakdown: ${r.violations.join(' | ')}`);
  }],
  ['X5 a family stated as a word this reader cannot parse', (f) => {
    f.readme = f.readme.replace(/seven\s+that\s+grade/, 'eleventy that grade');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('eleventy') && v.includes('not a number this reader parses')), `unparseable: ${r.violations.join(' | ')}`);
    // The compound in the same sentence is the reader's other half: a refusal raised because twenty-five could
    // not be read would look exactly like this one, so the arm that proves words are read proves compounds too.
    // Quoted as the reader quotes it — the refusal's own text names the shape it knows, so a bare word test
    // would refuse the arm for the message it was written to raise.
    assert.ok(!r.violations.some((v) => v.includes('a family as "twenty-five"')), `compound failed to parse: ${r.violations.join(' | ')}`);
  }],
  ['X6 the headline number written so no shape reads it', (f) => {
    f.readme = f.readme.replace('**132 fixture arms** prove', 'about fifty-odd fixture arms, proved');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('states no "**N fixture arms**" total')), `missing headline: ${r.violations.join(' | ')}`);
  }],
  ['X7 the breakdown sentence reshaped out of existence', (f) => {
    f.readme = f.readme.replace('prove each refusal on a synthetic plane', 'are the arms, and they prove refusals somewhere');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('arms sentence is missing or reshaped')), `reshaped sentence: ${r.violations.join(' | ')}`);
  }],
  ['X8 two families whose numbers were swapped', (f) => {
    f.readme = f.readme.replace('ten that drift', '__swap__ that drift').replace('seven that grade the numbers', 'ten that grade the numbers').replace('__swap__ that drift', 'seven that drift');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('arm family 2 (R)') && v.includes('two families were swapped')), `swapped: ${r.violations.join(' | ')}`);
    assert.ok(r.violations.some((v) => v.includes('arm family 5 (N)') && v.includes('two families were swapped')), `swapped back: ${r.violations.join(' | ')}`);
  }],
  // ── the marker arms: the roster this file quotes in its own header is graded too (v611) ─────────────────
  ['S1 the header marker states an out-of-date total', (f) => { f.source = f.source.replace('// ROSTER 132 arms', '// ROSTER 96 arms'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('ROSTER line says 96 arms; the arms list defines 132')), `stale marker total: ${r.violations.join(' | ')}`);
  }],
  ['S2 the header marker gone', (f) => {
    f.source = f.source.replace('// ROSTER 132 arms in 12 families — A19 · R10 · M25 · T17 · N7 · X8 · S7 · C8 · D14 · E10 · F2 · G5', '// the marker moved into prose, where nothing reads it');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('states no "// ROSTER') && v.includes('a sentence with nothing behind it')), `missing marker: ${r.violations.join(' | ')}`);
  }],
  ['S3 a family pair in the marker that the list does not count', (f) => { f.source = f.source.replace('· X8 ·', '· X7 ·'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes("family 6 says \"X7\"") && v.includes('counts 8 arms named X*')), `wrong pair: ${r.violations.join(' | ')}`);
    assert.ok(r.violations.some((v) => v.includes("families add to 131 against its own headline of 132")), `marker arithmetic: ${r.violations.join(' | ')}`);
  }],
  ['S4 a marker reshaped out of its grammar', (f) => {
    // Kept behind the "// ROSTER " the reader looks for: an arm that drops the prefix aims at S2's refusal, and
    // two arms hitting one message is one arm fewer than the roster says.
    f.source = f.source.replace('// ROSTER 132 arms in 12 families — A19 · R10 · M25 · T17 · N7 · X8 · S7 · C8 · D14 · E10 · F2 · G5', '// ROSTER ninety-eight arms, eight families');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('ROSTER line is reshaped') && v.includes('a marker nothing parses is a comment')), `reshaped marker: ${r.violations.join(' | ')}`);
  }],
  ['S5 a family pair the marker writes in words', (f) => { f.source = f.source.replace('· N7 ·', '· Nseven ·'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('a pair is a letter prefix and a count, in that order')), `pair in words: ${r.violations.join(' | ')}`);
  }],
  ['S6 a marker whose own family count is out of date', (f) => { f.source = f.source.replace('in 12 families', 'in 11 families'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('ROSTER line says 11 families; the arms list defines 12')), `stale family count: ${r.violations.join(' | ')}`);
  }],
  ['S7 a marker that dropped one family pair', (f) => { f.source = f.source.replace(' · C8', ''); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('lists 11 family pair(s); the arms list defines 12')), `dropped pair: ${r.violations.join(' | ')}`);
  }],
  // ── the coverage arms: the arms list is asked what it proved (v624) ─────────────────────────────────────
  ['C1 a refusal no arm reaches and nobody declares', (f) => { f.coverage.declared = []; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('rise on no plane and are declared by nobody') && v.includes('fxRows#3')), `undeclared unaimed: ${r.violations.join(' | ')}`);
  }],
  ['C2 a declaration whose refusal an arm now reaches', (f) => {
    f.coverage.sets.push({ name: 'K3 the census that closes over nothing', violations: ['the fixture census closed at 3 over nothing anyone can re-run'] });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fxRows#3 is declared unarmed, but K3 reaches it') && v.includes('the excuse no longer excuses')), `excuse that no longer excuses: ${r.violations.join(' | ')}`);
  }],
  ['C3 a declaration of a refusal this file does not author', (f) => {
    f.coverage.declared.push({ key: 'fxRows#9', why: 'the synthetic plane has no ninth refusation, which is the point of the arm', next: 'arm K4 the refusal that has gone' });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('declares fxRows#9, which this file does not author')), `dangling declaration: ${r.violations.join(' | ')}`);
  }],
  ['C4 an arm that says a sentence no refusal authors', (f) => {
    f.coverage.sets.push({ name: 'K9 an arm asserting text nobody wrote', violations: ['the fixture row never existed and the census is a rumour'] });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('K9 produced a refusal this file does not author')), `stranded arm: ${r.violations.join(' | ')}`);
  }],
  ['C5 a declaration with no arm it owes', (f) => { f.coverage.declared[0].next = 'later, when someone has time'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('without naming the arm that owes it') && v.includes('permanent exclusion wearing a new word')), `no next: ${r.violations.join(' | ')}`);
  }],
  ['C6 the same refusal excused twice', (f) => { f.coverage.declared.push({ ...f.coverage.declared[0] }); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('declares fxRows#3 twice') && v.includes('two answers to one question')), `duplicate excuse: ${r.violations.join(' | ')}`);
  }],
  ['C7 a push this reader cannot close', (f) => {
    f.coverage = fxOpened({ ...f.coverage, source: `${f.coverage.source}\nfunction fxBroken() {\n  const violations = [];\n  PUSH('an unclosed refusal` });
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('cannot be closed by this reader')), `unclosable push: ${r.violations.join(' | ')}`);
  }],
  ['C8 an excuse no reader can falsify', (f) => { f.coverage.declared[0].why = 'because'; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('fxRows#3 is declared unarmed without a reason a reader can falsify') && v.includes('an excuse is not a disposition')), `unfalsifiable excuse: ${r.violations.join(' | ')}`);
  }],
  // ── the authoring-box arms: a published duration ages exactly like a count (v625) ────────────────────────
  ['D1 the duration table gone from the README', (f) => { f.readme = f.readme.split('\n').slice(0, -3).join('\n'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('the README states no') && v.includes('a table no reader walks is a claim nobody checks')), `no table: ${r.violations.join(' | ')}`);
  }],
  ['D2 the headline carrying the date for every row', (f) => {
    f.readme = f.readme.replace(FX_HEADER, '| row | proof | measured on the authoring box (2026-10-28) |');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes("table's header is") && v.includes('a date carried in the headline times every row')), `headline date: ${r.violations.join(' | ')}`);
  }],
  ['D3 a census that runs with no commit dates to compare against', (f) => { f.committedAt = null; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('no commit dates or run-day were supplied')), `no dates supplied: ${r.violations.join(' | ')}`);
  }],
  ['D4 a table of header and separator and no claims', (f) => { f.readme = f.readme.split('\n').slice(0, -1).join('\n'); }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('a header and no rows')), `empty table: ${r.violations.join(' | ')}`);
  }],
  ['D5 a row the reader cannot split', (f) => {
    f.readme = f.readme.replace(FX_ROW, '| `verify:row` | `docs/evidence/x/row-proof.mjs` | 0.9 s on 2026-11-01 | extra note |');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('has 4 cell(s), not the three') && v.includes('is a claim it cannot check')), `wrong cells: ${r.violations.join(' | ')}`);
  }],
  ['D6 a duration for a door the build does not walk', (f) => {
    f.readme = f.readme.replace(FX_ROW, FX_ROW.replace('verify:row', 'verify:ghost'));
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('times verify:ghost, which is not a row this census runs')), `ghost row: ${r.violations.join(' | ')}`);
  }],
  ['D7 the same row timed twice', (f) => { f.readme = `${f.readme}\n${FX_ROW}`; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('names verify:row twice') && v.includes('one number that is not the row')), `duplicate row: ${r.violations.join(' | ')}`);
  }],
  ['D8 a row that names a file other than the one it runs', (f) => {
    f.readme = f.readme.replace(FX_ROW, FX_ROW.replace('row-proof.mjs', 'leaf.mjs'));
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('names docs/evidence/x/leaf.mjs') && v.includes('but that row runs docs/evidence/x/row-proof.mjs')), `wrong subject: ${r.violations.join(' | ')}`);
  }],
  ['D9 a row that says the row was quick', (f) => {
    f.readme = f.readme.replace(FX_ROW, '| `verify:row` | `docs/evidence/x/row-proof.mjs` | quick, on 2026-11-01 — the fixture row |');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('states no duration this reader parses') && v.includes('are not measurements')), `no duration: ${r.violations.join(' | ')}`);
  }],
  ['D10 a duration that never says when', (f) => {
    f.readme = f.readme.replace(FX_ROW, FX_ROW.replace(' on 2026-11-01', ''));
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('states a duration with no date') && v.includes('the wrong kind of permanent')), `no date: ${r.violations.join(' | ')}`);
  }],
  ['D11 a date in a shape no reader can order', (f) => {
    f.readme = f.readme.replace(FX_ROW, FX_ROW.replace('2026-11-01', '2026-13-45'));
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('is not a calendar day this reader can order')), `bad day: ${r.violations.join(' | ')}`);
  }],
  ['D12 a measurement taken from a day that has not arrived', (f) => {
    f.readme = f.readme.replace(FX_ROW, FX_ROW.replace('2026-11-01', '2099-01-01'));
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('is dated 2099-01-01, after the') && v.includes('a day that has not arrived')), `future date: ${r.violations.join(' | ')}`);
  }],
  ['D13 a row that times bytes no commit holds', (f) => { delete f.committedAt['docs/evidence/x/row-proof.mjs']; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('which has no commit date this census can read')), `no commit date: ${r.violations.join(' | ')}`);
  }],
  ['D14 a duration that blames bytes the table predates', (f) => {
    f.committedAt['docs/evidence/x/row-proof.mjs'] = { at: f.now, ref: 'beef456' };
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('was measured on 2026-11-01, but') && v.includes('the table times bytes that no longer exist')), `stale measurement: ${r.violations.join(' | ')}`);
  }],
  // ── the hosted-claim arms: a run's verdict is re-derived from the commit it names (v626) ─────────────────
  ['E1 a census handed no ref facts to re-derive the hosted claims against', (f) => { f.refs = null; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('was handed no ref facts')), `no ref facts: ${r.violations.join(' | ')}`);
  }],
  ['E2 an address that is not a commit address', (f) => {
    f.readme = f.readme.replace(FX_HOSTED, FX_HOSTED.replace(FX_SHA, 'cafeO01'));
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('cafeO01') && v.includes('is not a commit address')), `bad address: ${r.violations.join(' | ')}`);
  }],
  ['E3 an address no commit in this clone answers', (f) => { delete f.refs[FX_SHA]; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('no commit in this clone answers')), `unresolvable: ${r.violations.join(' | ')}`);
  }],
  ['E4 an address two commits share', (f) => { f.refs[FX_SHA].count = 2; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('resolves twice resolves to nothing')), `ambiguous: ${r.violations.join(' | ')}`);
  }],
  ['E5 an address that is not on this history', (f) => { f.refs[FX_SHA].ancestor = false; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('not on this history')), `off history: ${r.violations.join(' | ')}`);
  }],
  ['E6 a population the commit it names does not derive', (f) => { f.refs[FX_SHA].rows = 3; }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('says a derived population of 2 at cafe001; the scripts committed there derive 3')), `population: ${r.violations.join(' | ')}`);
  }],
  ['E7 a run dated in a shape no reader can order', (f) => {
    f.readme = f.readme.replace(FX_HOSTED, FX_HOSTED.replace(FX_DAY, '2026-13-45'));
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('2026-13-45') && v.includes('not a calendar day this reader can order')), `bad day: ${r.violations.join(' | ')}`);
  }],
  ['E8 a run dated before the commit it claims to have tested', (f) => {
    f.refs[FX_SHA].at = Math.floor(Date.parse('2026-10-31T12:00:00Z') / 1000);
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('before cafe001 landed on 2026-10-31 UTC') && v.includes('no timezone explains it')), `dated before: ${r.violations.join(' | ')}`);
  }],
  ['E9 a run dated a day the push cannot account for', (f) => {
    f.refs[FX_SHA].at = Math.floor(Date.parse('2026-10-27T12:00:00Z') / 1000);
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('more than a UTC day after cafe001 landed on 2026-10-27')), `dated after: ${r.violations.join(' | ')}`);
  }],
  ['E10 one run claimed against two different commits', (f) => {
    f.readme = `${f.readme}\n\n- Run \`${FX_RUN}\` (sha \`${FX_SHA2}\`) says the same build ran on another commit.`;
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('is claimed against two commits here') && v.includes('one run tests one ref')), `double anchor: ${r.violations.join(' | ')}`);
  }],
  ['F1 a run number written with no address beside it', (f) => {
    f.readme = [f.readme, '', '- Run `40000000999` was green on the fixture host, and nothing here names the ref it tested.'].join('\n');
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('40000000999') && v.includes('no commit address in the same paragraph')), `bare run number: ${r.violations.join(' | ')}`);
  }],
  ['F2 the address struck off the run its paragraph already named', (f) => {
    f.readme = f.readme.replace(FX_HOSTED, FX_HOSTED.replace('sha `' + FX_SHA + '`, ', ''));
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes(FX_RUN) && v.includes('no commit address in the same paragraph')), `address struck: ${r.violations.join(' | ')}`);
  }],
  // —— the bare-address arms: an address is what this clone resolves, not the word beside it (v631)──────────
  ['G1 the word sha struck off a hosted claim leaves it anchored and its numbers ungraded', (f) => {
    f.readme = f.readme.replace(FX_HOSTED, FX_HOSTED.replace('sha `' + FX_SHA + '`', '`' + FX_SHA + '`'));
  }, (r) => {
    assert.deepEqual(r.violations, [], `the bare spelling over-reached: ${r.violations.join(' | ')}`);
  }],
  ['G2 a run anchored only on a bare address this history does not carry', (f) => {
    f.refs.cafe004 = { at: Math.floor(Date.parse('2026-10-30T12:00:00Z') / 1000), count: 1, ancestor: false, rows: 2 };
    f.readme = `${f.readme}\n\n- Run \`40000000666\` (\`cafe004\`) is the fixture verdict on a commit this history does not carry.`;
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('40000000666') && v.includes('no commit address in the same paragraph')), `off-history bare anchor: ${r.violations.join(' | ')}`);
    assert.ok(!r.violations.some((v) => v.includes('not on this history')), `a bare off-history ref refused as an address: ${r.violations.join(' | ')}`);
  }],
  ['G3 a bare abbreviation two commits share, written beside a run number', (f) => {
    f.refs.cafe003 = { at: null, count: 2, ancestor: false, rows: null };
    f.readme = `${f.readme}\n\n- Run \`40000000777\` (\`cafe003\`) is the fixture verdict whose abbreviation two commits share.`;
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('cafe003') && v.includes('share that abbreviation')), `ambiguous bare address: ${r.violations.join(' | ')}`);
  }],
  ['G4 a bare token that resolves to nothing is a digest, not an anchor', (f) => {
    f.readme = `${f.readme}\n\n- Run \`40000000888\` (\`cafe009\`) is the fixture verdict anchored on a content digest.`;
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('40000000888') && v.includes('no commit address in the same paragraph')), `digest not an anchor: ${r.violations.join(' | ')}`);
    assert.ok(!r.violations.some((v) => v.includes('cafe009')), `digest refused as an address: ${r.violations.join(' | ')}`);
  }],
  ['G5 a run spelled at one commit and cited bare at another', (f) => {
    f.readme = `${f.readme}\n\n- Run \`${FX_RUN}\` is also claimed at \`${FX_SHA2}\`.`;
  }, (r) => {
    assert.ok(r.violations.some((v) => v.includes('is claimed against two commits here') && v.includes(FX_SHA2)), `bare second anchor: ${r.violations.join(' | ')}`);
  }],
];

/**
 * The refusations this file authors that no fixture arm reaches, each with what it refuses and the arm it
 * owes. The table can only shrink: an arm that reaches a declared site reddens the declaration, and a
 * declaration whose site has gone reddens too — and in v624 it emptied, because every refusal the census can
 * state turned out to be one the synthetic plane can raise. It stays as the SHAPE a future refusal falls back
 * into: a row is a debt that names the arm owing it, never an excuse, and armCoverage refuses a row whose site
 * an arm now reaches, a row for a site this file does not author, and a site that has neither arm nor row.
 */
export const UNARMED = [];

function runArms() {
  const results = ARMS.map(([name, patch, check]) => {
    const f = BASE();
    patch(f);
    const tracked = (f.tracked ?? Object.keys(f.files).filter((p) => p.startsWith('docs/evidence/'))).slice().sort();
    const index = (f.index ?? Object.keys(f.files)).slice().sort();
    const read = (p) => (Object.prototype.hasOwnProperty.call(f.files, p) ? f.files[p] : null);
    const report = censusOf({ tracked, scripts: f.scripts, excluded: f.excluded, roster: f.roster, swept: f.swept, read, readme: f.readme, index, workflow: f.workflow, manifest: f.manifest, standby: f.toolsStandby, source: f.source, coverage: f.coverage, committedAt: f.committedAt, now: f.now, refs: f.refs });
    try {
      check(report);
      return { name, ok: true, violations: report.violations };
    } catch (e) {
      return { name, ok: false, why: e.message, violations: report.violations };
    }
  });
  const bad = results.filter((r) => !r.ok);
  for (const b of bad) console.log(`  ARM FAILED ${b.name}: ${b.why}`);
  assert.deepEqual(bad.map((b) => b.name), [], `${bad.length} of ${results.length} arms did not reach the refusal they aimed at`);
  console.log(`[arms] ${results.length}/${results.length} MATCHED — each refusal rises from the fixture the arm rewrites, the prose-import arm proves the tokenizer is the sweep's, and the README arms drift one number at a time on the same plane`);
  return results.map(({ name, violations }) => ({ name, violations }));
}

/**
 * A git answer that may honestly come back empty: an address the clone does not hold has nothing to show,
 * and the reader refuses that claim by name rather than a throw hiding the fifteen behind it.
 */
async function gitOrNone(argv, cwd) {
  try {
    return (await sweep.gitText(argv, cwd)).trim();
  } catch {
    return null;
  }
}

async function main() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const tracked = (await sweep.gitText(['ls-files', '--', 'docs/evidence'], ROOT))
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => MODULE_RE.test(s))
    .sort();
  assert.ok(tracked.length >= 40, `git ls-files returned ${tracked.length} evidence modules — a population that small is a broken filter, not a repository`);
  // The manifest census needs the WHOLE index, not the evidence half: the doors it disposes open onto
  // tools/harness and services/nexus-api, and a script naming a file no clone holds is the same dangling door
  // one of the derived rows naming a deleted proof would be.
  const index = (await sweep.gitText(['ls-files'], ROOT)).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).sort();
  assert.ok(index.length >= tracked.length, `the whole index (${index.length}) is smaller than the evidence half (${tracked.length}) — a listing that cannot hold its own subset is a broken git call, not a tree`);
  assert.ok(existsSync(join(ROOT, WORKFLOW_FILE)), `${WORKFLOW_FILE} is missing — no disposition can be checked against a workflow that is not in the tree`);
  const workflow = readFileSync(join(ROOT, WORKFLOW_FILE), 'utf8');

  const indexSwept = tracked.filter((f) => f.startsWith(SWEEP_DIR) && f.endsWith('-proof.mjs')).sort();
  const headSwept = (await sweep.trackedProofs('HEAD', ROOT)).slice().sort();
  assert.deepEqual(
    headSwept,
    indexSwept,
    `the index and HEAD disagree about the agents proofs: only-in-index ${JSON.stringify(indexSwept.filter((f) => !headSwept.includes(f)))} · only-in-HEAD ${JSON.stringify(headSwept.filter((f) => !indexSwept.includes(f)))} — the sweep's population is HEAD's, so a staged-but-uncommitted proof is invisible to it until it is committed`,
  );

  const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);
  assert.ok(existsSync(join(ROOT, README_FILE)), `${README_FILE} is missing — this census checks the table that restates its own counts, and a missing table is a red asking for the edit, not a skip`);
  const readme = readFileSync(join(ROOT, README_FILE), 'utf8');
  // This census reads its own bytes. The alternative is a marker that outlives the roster it describes, and
  // the whole point of the marker is that a reader who cannot run the arms list can still check it by eye.
  const source = readFileSync(join(ROOT, HERE), 'utf8');
  // The table's own rows say which files they timed, so the dates are fetched by PATH and nothing is guessed: a
  // duration is only a claim about code that has a commit behind it.
  const committedAt = {};
  for (const p of [...new Set(authoringTablePaths(readme))]) {
    const line = (await sweep.gitText(['log', '--format=%ct %h', '-1', '--', p], ROOT)).trim().split(/\r?\n/).pop();
    const m = /^(\d+) (\S+)$/.exec(String(line));
    if (m !== null) committedAt[p] = { at: Number(m[1]), ref: m[2] };
  }
  // A hosted claim names a commit, and a commit is something this clone can answer for. The history is read once
  // and every address resolved against it; the population is re-derived from the package.json committed AT that
  // ref, and only where the derivation is the same code this census runs, because a claim counted with a rule that
  // has since moved was true of the rules of its own time. gitOrNone is the one tolerated failure here: an address
  // the clone does not hold has no package.json to show, and the reader refuses that claim by name rather than a
  // throw hiding the fifteen behind it.
  const scanned = hostedClaims(readme);
  const history = (await sweep.gitText(['log', '--format=%H %ct', 'HEAD'], ROOT))
    .split(/\r?\n/)
    .map((l) => /^([0-9a-f]{40}) (\d+)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ full: m[1], at: Number(m[2]) }));
  assert.ok(history.length >= 50, `HEAD holds ${history.length} commits — a history that short is a shallow clone, and a hosted claim cannot be re-derived from one`);
  const derivation = derivationText(readFileSync(join(ROOT, 'tools/ci/proof-set.mjs'), 'utf8'));
  // Pass one (v631) hands the census the spelled addresses and every bare commit-shaped token the file writes.
  // A bare token is carried to resolution only where this clone's own history answers it: one that answers
  // nothing is a content digest, and the cat-file the spelled form spends would be spent on bytes that are not a
  // ref at all. The tokens that resolve are then read a second time AS addresses, so the paragraph that wrote one
  // is graded exactly like the paragraph that wrote the word sha.
  const spelledTokens = new Set(scanned.claims.map((c) => c.shaText));
  const bareCands = [...new Set(scanned.paragraphs.flatMap((p) => p.cands.map((c) => c.token)))].filter((t) => !spelledTokens.has(t));
  const toResolve = [...new Set([...scanned.claims.map((c) => c.shaText), ...bareCands.filter((t) => history.some((x) => x.full.startsWith(t)))])];
  const refs = {};
  const declined = [];
  for (const shaText of toResolve) {
    if (!SHA_GOOD_RE.test(shaText) || refs[shaText] !== undefined) continue;
    const hits = history.filter((h) => h.full.startsWith(shaText));
    if (hits.length > 1) { refs[shaText] = { at: null, count: hits.length, ancestor: false, rows: null }; continue; }
    if (hits.length === 0) {
      const kind = await gitOrNone(['cat-file', '-t', `${shaText}^{commit}`], ROOT);
      const stamp = kind === 'commit' ? await gitOrNone(['log', '-1', '--format=%ct', shaText], ROOT) : null;
      refs[shaText] = stamp === null
        ? { at: null, count: 0, ancestor: false, rows: null }
        : { at: Number(stamp), count: 1, ancestor: false, rows: null };
      continue;
    }
    const full = hits[0].full;
    const atRef = await gitOrNone(['show', `${full}:tools/ci/proof-set.mjs`], ROOT);
    const pkgText = await gitOrNone(['show', `${full}:package.json`], ROOT);
    let why = atRef === null
      ? 'no tools/ci/proof-set.mjs at that ref'
      : pkgText === null ? 'no package.json at that ref' : derivationText(atRef) !== derivation ? 'the derivation itself differs there' : null;
    let rows = null;
    if (why === null) {
      try { rows = derivePopulation(JSON.parse(pkgText).scripts ?? {}).length; } catch { rows = null; }
      if (rows === null) why = 'its package.json is not readable as JSON';
    }
    if (why !== null) declined.push(`${shaText} (${why})`);
    refs[shaText] = { at: hits[0].at, count: 1, ancestor: true, rows };
  }
  const isAddress = (t) => { const r = refs[t]; return r !== undefined && r.count === 1 && r.ancestor === true; };
  const hosted = hostedClaims(readme, isAddress);
  // The same question asked of the READMEs this census has no claim on: the sight is opened on the whole evidence
  // tree, and only the one file it grades is refused.
  const sightFiles = index
    .filter((f) => f.startsWith(EVIDENCE) && /(^|\/)README\.md$/.test(f) && f !== README_FILE)
    .sort();
  const sightRows = corpusAddressSight({ texts: Object.fromEntries(sightFiles.map((f) => [f, read(f) ?? ''])), history });
  const gradedRefs = Object.values(refs).filter((x) => typeof x.rows === 'number').length;
  const now = Math.floor(Date.now() / 1000);
  const report = censusOf({ tracked, scripts: pkg.scripts, excluded: EXCLUDED, roster: ROSTER, swept: headSwept, read, readme, index, workflow, manifest: MANIFEST, standby: TOOLS_STANDBY, source, committedAt, now, refs });
  assert.deepEqual(report.violations, [], `the census is RED:\n  ${report.violations.join('\n  ')}`);
  assert.deepEqual(report.unclassified, [], `the census found modules nobody has decided about: ${report.unclassified.join(', ')} — each must become a verify row, an EXCLUDED row, a reachable helper, or a ROSTER entry with a falsifiable reason`);
  assert.deepEqual(report.manifest.undispositioned, [], `the manifest holds verify:* names nobody has disposed: ${report.manifest.undispositioned.join(', ')} — declare each in MANIFEST as a runner, a covered claim the workflow answers, or a deferred door with its reach, measurement, blocker and next repair`);
  assert.deepEqual(report.tools.unreached, [], `the tools census found modules nobody has decided about: ${report.tools.unreached.join(', ')} — reach one from a row, wire and dispose the door that targets it, or declare it in TOOLS_STANDBY with its measurement, blocker, next repair and witness`);

  const rows = derivePopulation(pkg.scripts);
  assert.ok(rows.length >= 15, `the derived row population is ${rows.length} — the build's own census must not shrink without a record saying why`);
  assert.deepEqual(unknownExclusions(rows), [], 'EXCLUDED names a file that is not a derived row');
  const { running, residue } = splitSet(rows);
  assert.ok(running.some((r) => r.file === HERE), `${HERE} is not in the running set it just enumerated — a census that does not count its own counter is a census of other people's files`);

  const self = `node ${HERE}`;
  assert.equal(pkg.scripts['verify:evidence-census'], self, `verify:evidence-census is ${JSON.stringify(pkg.scripts['verify:evidence-census'])}, not \`${self}\` — the door that runs this census must be the census's own script`);

  console.log(`tracked evidence modules: ${tracked.length} (git ls-files -- docs/evidence, ${MODULE_RE.source})`);
  console.log(`  ROW        ${String(report.counts.row).padStart(3)}  = ${running.length} run by the build + ${residue.length} EXCLUDED by name`);
  console.log(`  HELPER     ${String(report.counts.helper).padStart(3)}  reachable from a row or tool by the imports the bytes really make`);
  console.log(`  SWEPT      ${String(report.counts.swept).padStart(3)}  walk by the agents sweep (human-run): node docs/evidence/agents/sweep.mjs`);
  console.log(`  TOOL       ${String(report.counts.tool).padStart(3)}  human-run, declared with a reason (printed below)`);
  console.log(`  DEFERRED   ${String(report.counts.deferred).padStart(3)}  runnable, blocked on a sandbox prerequisite (printed below)`);
  console.log(`  UNCLASSIFIED ${String(report.counts.unclassified).padStart(1)}`);
  console.log(`\nREADME ${README_FILE}: ROW ${report.counts.row} = ${running.length} run + ${residue.length} excluded · HELPER ${report.counts.helper} · SWEPT ${report.counts.swept} · TOOL ${report.counts.tool} · DEFERRED ${report.counts.deferred} · ${tracked.length} tracked — the table and both prose numbers agree with this run`);
  const roster = armsRoster(ARMS.map((a) => a[0]));
  console.log(`arms roster (counted from the names in ARMS itself, not copied from the printout): ${roster.total} arms in ${roster.families.length} families — ${roster.families.map((f) => `${f.label}${f.count}`).join(' · ')} · the README's sentence and the \`// ROSTER\` line in this file's own header restate every one of these numbers`);
  console.log(`\nbuild rows (${running.length}): ${running.map((r) => r.name).join(', ')}`);
  for (const r of residue) console.log(`  EXCLUDED  ${r.name.padEnd(24)} ${r.file} — ${EXCLUDED.find((e) => e.file === r.file).needs}`);
  const timed = [...new Set(authoringTablePaths(readme))];
  console.log(`\nauthoring-box table (${README_FILE}): ${timed.length} file(s) timed, each dated against the commit that last touched THAT file — ${timed.map((p) => `${p} ${committedAt[p] ? localDay(committedAt[p].at) : '(no commit)'}`).join(' · ') || '(none)'}; this census runs on ${localDay(now)}`);
  const hostedSet = new Set(hosted.claims.map((c) => c.shaText));
  const claimTokens = [...hostedSet];
  const bareTaken = hosted.claims.filter((c) => c.spelled === false);
  const statedPops = (s) => hosted.claims.filter((c) => c.shaText === s).map((c) => c.pops.join('/') || '-').join(' ');
  console.log(`\nhosted claims (${README_FILE}): ${hosted.claims.length} address(es) over ${hostedSet.size} distinct commit(s), ${bareTaken.length} of them written between backticks with no word sha in front of them and resolved anyway, resolved against HEAD's ${history.length}-commit history and re-derived there: ${gradedRefs} population(s) graded, ${declined.length} declined${declined.length === 0 ? '' : ` (${declined.join(', ')})`}; dates compare in UTC on both sides because the runner stamps its own start in UTC, unlike the authoring-box table above, which this box's own calendar dates`);
  for (const s of claimTokens) {
    const r = refs[s];
    if (r === undefined) continue;
    console.log(`    REF         ${s} ${String(r.count).padStart(2)} commit(s) ${r.ancestor ? 'on this history' : 'NOT on it'} ${r.at === null ? 'no stamp' : `landed ${utcDay(r.at)} UTC`} ${typeof r.rows === 'number' ? `derives ${r.rows} rows` : 'population declined'} ${statedPops(s) || '-'} stated`);
  }
  if (hosted.unowned.length > 0) {
    console.log(`    UNOWNED     ${hosted.unowned.length} population claim(s) state no address before them in their own paragraph and are printed, not guessed: ${hosted.unowned.map((u) => `L${u.line} says ${u.p}`).join(' · ')}`);
  }
  const bareRuns = hosted.paragraphs.flatMap((p) => p.ids.filter((id) => !p.runs.includes(id)).map((id) => `L${p.line}=${id}`));
  const runIds = [...new Set(hosted.paragraphs.flatMap((p) => p.ids))];
  const runParas = hosted.paragraphs.filter((p) => p.ids.length > 0).length;
  console.log(`    RUN NUMBERS ${runIds.length} distinct over ${runParas} paragraph(s): ${bareRuns.length} written with no address in the paragraph that names them${bareRuns.length === 0 ? '' : ` (${bareRuns.join(', ')})`} — a bare number is a verdict this clone has no ref to answer for`);
  const bareGraded = claimTokens.filter((t) => hosted.claims.some((c) => c.shaText === t && c.spelled === false) && !scanned.claims.some((c) => c.shaText === t));
  const bareRejected = bareCands.filter((t) => !isAddress(t));
  const tot = (k) => sightRows.reduce((a, x) => a + x[k], 0);
  const seen = sightRows.filter((x) => x.resolving + x.ambiguous + x.digests + x.bareRuns > 0);
  console.log(`    BARE ADDRESSES ${bareTaken.length} of ${hosted.claims.length} graded address(es) carry no word sha, over ${bareGraded.length} distinct commit(s) only the bare spelling names: ${bareGraded.join(', ') || '(none)'} · ${bareRejected.length} bare commit-shaped token(s) resolve to no single commit on this history and are read as digests, not addresses: ${bareRejected.join(', ') || '(none)'}`);
  console.log(`\naddress sight in the ${sightRows.length} evidence README${sightRows.length === 1 ? '' : 's'} this census does not grade, ${seen.length} of which write at least one bare commit-shaped token or a run id (printed, not refused: another lane's bytes are another lane's edit) — ${tot('resolving')} bare token(s) resolve to one commit here, ${tot('ambiguous')} to two or more, ${tot('digests')} to none; ${tot('runIds')} run id(s) written, ${tot('bareRuns')} of them in a paragraph that names no address at all`);
  for (const row of seen) {
    console.log(`    SIGHT       ${row.file} resolving=${row.resolving} ambiguous=${row.ambiguous} digest=${row.digests} runIds=${row.runIds} bareRuns=${row.bareRuns}`);
  }
  console.log('\nhelper modules:');
  for (const h of [...report.helpers].sort()) console.log(`  HELPER    ${h}`);
  console.log('\nhuman-run tools:');
  for (const e of ROSTER.filter((x) => x.class === 'tool')) console.log(`  TOOL      ${e.file}\n            run: ${e.run}\n            why: ${e.why}`);
  if (report.counts.deferred > 0) {
    console.log('\ndeferred rows (printed every run; a deferral that stops being printed has stopped existing):');
    for (const e of ROSTER.filter((x) => x.class === 'deferred')) console.log(`  DEFERRED  ${e.file}\n            run: ${e.run}\n            measured: ${e.measured}\n            blocker: ${e.blocker}\n            next: ${e.next}`);
  }
  const alsoSwept = rows.filter((r) => headSwept.includes(r.file)).map((r) => r.name);
  if (alsoSwept.length) console.log(`\nrows that are ALSO in the agents sweep's population (double coverage, not a conflict): ${alsoSwept.join(', ')}`);

  const mf = report.manifest;
  console.log(`\nmanifest (every verify:* NAME, not only the commands PROOF_COMMAND admits): ${mf.counts.names} names close as ${mf.counts.row} derived rows + ${mf.counts.runner} runner + ${mf.counts.covered} covered + ${mf.counts.deferred} deferred + ${mf.counts.undispositioned} undispositioned, over ${mf.commands.length} run commands the workflow actually executes`);
  for (const e of MANIFEST) {
    const cmd = String(pkg.scripts[e.name] ?? '');
    if (e.class === 'runner') {
      console.log(`  RUNNER     ${e.name.padEnd(22)} ${cmd} -- step ${JSON.stringify(mf.runnerSteps.get(e.name) ?? '(no step names this command)')} runs \`npm run ${e.name}\``);
    }
    else if (e.class === 'covered') console.log(`  COVERED    ${e.name.padEnd(22)} ${cmd} -- the workflow runs ${JSON.stringify(mf.coverage.get(e.name) ?? [])}`);
    else console.log(`  DEFERRED   ${e.name.padEnd(22)} ${cmd} -- code-reach ${e.reach}; blocker: ${e.blocker.slice(0, 72)}...; next: ${e.next.slice(0, 72)}...`);
  }

  const tc = report.tools;
  assert.ok(tc.population.length >= 10, `the tools population is ${tc.population.length} runnable modules — a census whose population shrinks past a floor it states is a reader that stopped reading`);
  console.log(`\ntools reach census (every runnable module under ${TOOLS_DIR}, read from git ls-files rather than declared): ${tc.counts.total} modules close as ${tc.counts.runner} runner + ${tc.counts.reached} reached + ${tc.counts.named} named + ${tc.counts.behind} behind + ${tc.counts.standby} standby + ${tc.counts.unreached} unreached, over a live closure of ${tc.live} modules reached from ${report.counts.row} rows, the runner door and ${report.counts.tool} declared tools (specifier scan: ${tc.scan.files} modules in ${tc.scan.ms} ms)`);
  for (const e of TOOLS_STANDBY) {
    console.log(`  STANDBY   ${e.path}\n            witness: ${e.reachedBy ? `reachedBy ${e.reachedBy}` : `replacedBy ${e.replacedBy}`}\n            measured: ${e.measured}\n            blocker: ${e.blocker}\n            next: ${e.next}`);
  }
  for (const b of tc.behind) console.log(`  BEHIND    ${b.path} — imported only by ${b.importers.join(', ')}, none of which the build walks`);

  const sets = runArms();
  // The arms list is graded by the same census it arms: every refusation this file authors is either reached by
  // an arm's own run or declared in UNARMED with the arm it owes. This runs after the arms because it reads what
  // they produced, and it reads THIS file's bytes, so the index and the plane are the same bytes the build runs.
  const coverage = armCoverage({ source, sets, declared: UNARMED });
  assert.deepEqual(coverage, [], `the arms coverage is RED:\n  ${coverage.join('\n  ')}`);
  const { sites, forwards } = refusalSites(source);
  const reached = sites.filter((s) => sets.some((x) => (x.violations ?? []).some((v) => segmentsMatch(v, s.segs))));
  const excused = sites.filter((s) => !reached.some((r) => r.key === s.key) && UNARMED.some((d) => d.key === s.key));
  console.log(`arms coverage: ${sites.length} refusations authored in this file (${forwards.length} more push a list another function wrote) — ${reached.length} reached by an arm's own run, ${excused.length} declared in UNARMED with the arm they owe, ${sites.length - reached.length - excused.length} unaccounted`);

  console.log(`\nevidence census: ${tracked.length} tracked modules close as ${report.counts.row} row + ${report.counts.helper} helper + ${report.counts.swept} swept + ${report.counts.tool} tool + ${report.counts.deferred} deferred · ${report.counts.unclassified} unclassified · rows ${running.length}+${residue.length} · every row file the commit owns · the README's table and prose restate these numbers and agree`);
  console.log(`tools census: ${report.tools.counts.total} runnable modules under ${TOOLS_DIR} close as ${report.tools.counts.runner} runner + ${report.tools.counts.reached} reached + ${report.tools.counts.named} named + ${report.tools.counts.behind} behind + ${report.tools.counts.standby} standby · ${report.tools.counts.unreached} unreached · both censuses read the same index, scripts and workflow in one call`);
}

if (sweep.isMainModule(import.meta.url)) await main();
