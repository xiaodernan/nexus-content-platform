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
// nothing about the mirror question: does every `verify:*` NAME have one? Measured at this ref: the manifest holds
// 125 verify:* scripts, PROOF_COMMAND admits 116, and the 9 it drops are doors the build never walks - seven
// real-browser proofs under tools/harness (each one imports the CDP launcher and six of them navigate a Studio on
// 127.0.0.1:3210 that no workflow step starts), the maven suite (the workflow runs its own `mvn ... test` line
// rather than the script), and `verify:proofs` itself (the runner the proofs step calls). Nothing DECIDED those
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
// -- tools` holds 16 runnable modules at this ref. One is the runner the proofs step calls; four are imported by a
// module the live closure reaches (125 modules are live, and the closure walks them through the sweep's tokenizer);
// seven are the node targets of the seven deferred harness doors; and FOUR were in no class at all —
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
 * The commands the workflow really runs, as strings. Deliberately narrower than ci-wiring's step reader: this
 * census asks one question - does some command CI executes name this subject - so it takes run lines (inline and
 * block scalar) and drops comment lines, and claims nothing about ordering, swallow-checking or step names, all
 * of which docs/evidence/ci/ci-wiring-proof.mjs grades. A shape this reader cannot parse yields NO command, which
 * reddens a coverage claim rather than quietly satisfying it.
 */
export function runCommandsOf(workflow) {
  const out = [];
  let inBlock = false;
  let keyIndent = 0;
  for (const raw of String(workflow).split(/\r?\n/)) {
    if (/^\s*#/.test(raw)) continue;
    const indent = (raw.match(/^\s*/) || [''])[0].length;
    if (inBlock) {
      if (raw.trim() === '') continue;
      if (indent <= keyIndent) inBlock = false;
      else {
        out.push(raw.trim());
        continue;
      }
    }
    const m = /^(\s*)run:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const value = m[2].trim();
    if (value === '|' || value === '>' || value === '|-' || value === '>-') {
      inBlock = true;
      keyIndent = m[1].length;
    } else if (value !== '') out.push(value);
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
  const commands = typeof workflow === 'string' ? runCommandsOf(workflow) : null;
  if (commands === null) {
    violations.push('no workflow text was supplied, so not one `verify:*` disposition can be checked against what CI really runs - an unchecked claim is the silence this census exists to break');
  } else if (commands.length === 0) {
    violations.push(`the workflow reader found 0 run commands in ${WORKFLOW_FILE} - a reader that sees no commands cannot certify that any script is covered`);
  }

  const byName = new Map();
  const coverage = new Map();
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
        if (!indexSet.has(target)) violations.push(`${name} is the runner the proofs step calls, but the commit does not own ${target} — CI would check out a manifest naming a file no clone holds`);
        if (target.startsWith(EVIDENCE)) violations.push(`${name} is disposed as the runner while its target ${target} sits under ${EVIDENCE} — that command is a derived row, not a door`);
      }
      if (commands && !commands.includes(`npm run ${name}`)) violations.push(`${name} is disposed as the runner, but no run line in ${WORKFLOW_FILE} calls \`npm run ${name}\` — the workflow stopped walking the door this census is standing in`);
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

  return { counts, dispositions: [...byName.entries()].map(([n, e]) => ({ name: n, ...e })), undispositioned, commands, coverage, violations };
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
export function censusOf({ tracked, scripts, excluded = [], roster = [], swept = [], read, readme = null, index = [], workflow = null, manifest = [], standby = [] }) {
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
  if (typeof readme !== 'string' || readme.trim() === '') {
    violations.push('no README was supplied, so the table that restates these counts is unchecked — the census prints numbers a human copies by hand, and an unchecked copy is the rot this check exists for');
  } else {
    violations.push(...readmeDrift({ readme, counts, running, residue, tracked }));
  }

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

// ── the fixture arms: every refusal above, measured on a synthetic plane ─────────────────────────────
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
  ].join('\n'),
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
];

function runArms() {
  const results = ARMS.map(([name, patch, check]) => {
    const f = BASE();
    patch(f);
    const tracked = (f.tracked ?? Object.keys(f.files).filter((p) => p.startsWith('docs/evidence/'))).slice().sort();
    const index = (f.index ?? Object.keys(f.files)).slice().sort();
    const read = (p) => (Object.prototype.hasOwnProperty.call(f.files, p) ? f.files[p] : null);
    const report = censusOf({ tracked, scripts: f.scripts, excluded: f.excluded, roster: f.roster, swept: f.swept, read, readme: f.readme, index, workflow: f.workflow, manifest: f.manifest, standby: f.toolsStandby });
    try {
      check(report);
      return { name, ok: true };
    } catch (e) {
      return { name, ok: false, why: e.message };
    }
  });
  const bad = results.filter((r) => !r.ok);
  for (const b of bad) console.log(`  ARM FAILED ${b.name}: ${b.why}`);
  assert.deepEqual(bad.map((b) => b.name), [], `${bad.length} of ${results.length} arms did not reach the refusal they aimed at`);
  console.log(`[arms] ${results.length}/${results.length} MATCHED — each refusal rises from the fixture the arm rewrites, the prose-import arm proves the tokenizer is the sweep's, and the README arms drift one number at a time on the same plane`);
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
  const report = censusOf({ tracked, scripts: pkg.scripts, excluded: EXCLUDED, roster: ROSTER, swept: headSwept, read, readme, index, workflow, manifest: MANIFEST, standby: TOOLS_STANDBY });
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
  console.log(`\nbuild rows (${running.length}): ${running.map((r) => r.name).join(', ')}`);
  for (const r of residue) console.log(`  EXCLUDED  ${r.name.padEnd(24)} ${r.file} — ${EXCLUDED.find((e) => e.file === r.file).needs}`);
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
    if (e.class === 'runner') console.log(`  RUNNER     ${e.name.padEnd(22)} ${cmd} -- the workflow's proofs step calls \`npm run ${e.name}\``);
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

  runArms();

  console.log(`\nevidence census: ${tracked.length} tracked modules close as ${report.counts.row} row + ${report.counts.helper} helper + ${report.counts.swept} swept + ${report.counts.tool} tool + ${report.counts.deferred} deferred · ${report.counts.unclassified} unclassified · rows ${running.length}+${residue.length} · every row file the commit owns · the README's table and prose restate these numbers and agree`);
  console.log(`tools census: ${report.tools.counts.total} runnable modules under ${TOOLS_DIR} close as ${report.tools.counts.runner} runner + ${report.tools.counts.reached} reached + ${report.tools.counts.named} named + ${report.tools.counts.behind} behind + ${report.tools.counts.standby} standby · ${report.tools.counts.unreached} unreached · both censuses read the same index, scripts and workflow in one call`);
}

if (sweep.isMainModule(import.meta.url)) await main();
