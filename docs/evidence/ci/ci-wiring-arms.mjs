// NEXUS v528 (docs/evidence/ci) — THE CI WIRING IS ARMED AGAINST ITS OWN ROT, AND EACH ARM REDDENS AT THE CLAUSE IT NAMES (ADR 0016 amendment 514).
// v555 (amendment 536) — A ROW, NOT A HUMAN'S ERRAND. The sentence here used to say this file is "never
// scheduled as a row" because its job is to break its own subject; measured, that was false in the way v546
// found an exclusion's reason false: every arm rewrites a COPY of the gate or the runner inside a plane under
// `../nexus-ci-arms-plane-<pid>`, and the only file this tool ever wrote inside the repository was the receipt.
// With the receipt now written only when its content (not its date) would change, scheduling the arms cannot
// rewrite a graded byte, so `verify:arms` is a derived row and the build re-earns the whole arm set on every run.
//
// Why this exists, stated the way §60 requires: amendment 514 shipped `.github/workflows/ci.yml`'s first
// `verify:*` step and `tools/ci/proof-set.mjs`, and a shipped gate is worth exactly as much as the day someone
// tries to make it stop. `ci-wiring-proof.mjs` reads a workflow and refuses eleven shapes; every one of those
// refusals is a sentence until an arm proves it is a DOOR. So each arm below rewrites one byte-range of one
// plane file — the trigger losing `master`, the proof step vanishing or doubling, a `|| true` growing on it,
// the proofs moving before the build, an exemption outliving its hazard, a dangling script, an exclusion for a
// proof that reaches nothing, the job's ceiling vanishing, being raised past the rows' own worst case, falling
// under the floor or not being a number at all, its token widening to a write scope, losing its read scope, or
// losing its `permissions:` block entirely — and the arm is satisfied only when the gate reddens at EXACTLY the
// predicted clause: every `[§k]` below it printed, none of it or above did, and the stderr carries that clause's
// own words. v540 added one arm per §11 assertion, because "every refusal is a door" means all eight of them.
//
// The second half grades the RUNNER rather than the gate, because "a red proof fails the build" is a claim about
// an exit code: a stub that exits 3 must produce exit 1 and a named cause, a stub that hangs must produce
// TIMEOUT and NOT red, `--list` must run nothing (proved by the absence of the file the stubs append to), a
// `--only` typo must refuse to certify an empty set, and a missing `dist` must say the build is absent rather
// than call the proof red — amendment 78's two colours, measured through the door that ships them. v550 adds the
// pair that grades the CAUSE itself: an assertion whose subject sits on its second line must reach the log
// (R12), and the stack under it must not (R13) — the runner's first hosted red, `verify:package-counts` on
// 40920204170, was printed as a headline and nothing else, and the rows it named were invisible. v563 adds the
// pair that grades the GREEN channel (amendment 538): a green row's own last line must reach the log (R14), and
// a red row's stdout must not borrow that gutter (R15) — the hole amendment 535 named in its own bounds.
//
// Nothing an ARM writes survives: each one gets its own plane directory, built from pristine bytes read out of
// `SRC` (derived from THIS file's own location, not from the caller's cwd), and is removed the moment the arm
// ends, so an arm cannot leak a mutated copy into the next one. The ONE file this tool writes inside the
// repository is the receipt (v542): after a run where every arm matched it stamps the sha256 of every subject it
// graded, so a later change to any of those bytes has a way to be NOTICED — `verify:arms-freshness` reddens the
// build until the arms are re-run. A red run writes nothing: a receipt may only come from a run that was whole.
// v555: the write happens only when the receipt's CONTENT would change — a full run over unchanged bytes leaves
// the file (and its `ranAt`) exactly as committed, which is what lets the build schedule this tool as a row
// without a run re-stamping evidence bytes.
//
// sweep-budget-ms: 900000
//
// Run from the repository root:  node docs/evidence/ci/ci-wiring-arms.mjs     (~7 minutes on this box, both halves;
// the row declares 15 minutes because four runner arms sleep between 0.6 s and 1.5 s by design)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeReceipt, markerLine, populationOf, RECEIPT_FILE, subjectsOf } from './arms-receipt.mjs';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PLANE_ROOT = resolve(SRC, '..', `nexus-ci-arms-plane-${process.pid}`);

const producer = await import(pathToFileURL(join(SRC, 'tools/ci/proof-set.mjs')).href);
const pkg = JSON.parse(readFileSync(join(SRC, 'package.json'), 'utf8'));
const population = producer.derivePopulation(pkg.scripts);
// The bytes the arms are about to grade, captured before the first plane exists. At receipt time the tool
// recomputes them and refuses to write if they moved: a shared checkout can change under a nine-minute run, and
// a receipt stamping the LATER bytes would certify a wiring no arm ever touched — the same staleness it exists
// to refuse, wearing the receipt's own signature.
const gradedSubjects = subjectsOf(SRC);
const gradedPopulation = populationOf(SRC);

// ── the machinery ─────────────────────────────────────────────────────────────────────────────────────
/**
 * Replace ONE occurrence, in the plane file's own line endings. An arm that silently matched nothing would run
 * the gate over pristine bytes and report a MISMATCH as a surviving guard, so the hit count is asserted and the
 * carrier's EOL is preserved rather than assumed.
 */
function splice(text, from, to, label) {
  const crlf = text.includes('\r\n');
  // A lone LF is an `\n` not PRECEDED by `\r`. v540 found the guard written as `/\n(?!\r)/` — a lookahead,
  // which flags every ordinary CRLF ending — so the first arm to touch a pure-CRLF carrier
  // (`table-recount-proof.mjs`, through A14's derived markers) was refused as "mixed" while it was uniformly
  // CRLF. A guard that refuses the shape it was written for is a door nobody opened.
  assert.ok(!crlf || !/(?<!\r)\n/.test(text), `${label}: the carrier mixes LF and CRLF, so a normalised needle would match one shape and not the other`);
  const eol = crlf ? '\r\n' : '\n';
  const enc = (s) => s.split('\n').join(eol);
  const f = enc(from);
  const t = enc(to);
  const hits = text.split(f).length - 1;
  assert.equal(hits, 1, `${label}: the needle ${JSON.stringify(from.slice(0, 56))} occurs ${hits} times, and an arm that edits nothing — or two things — grades nothing`);
  return text.split(f).join(t);
}

function makePlane(tag, files) {
  const dir = join(PLANE_ROOT, tag);
  rmSync(dir, { recursive: true, force: true });
  for (const [rel, text] of files) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, 'utf8');
  }
  return dir;
}

const readSrc = (rel) => readFileSync(join(SRC, rel), 'utf8');

// ── half 1: the gate ──────────────────────────────────────────────────────────────────────────────────
// The closure is everything ci-wiring-proof.mjs reads, imported or byte-read: the workflow, the manifest, the
// runner, the sweep it borrows its budget grammar from, this file's own bytes, and every proof the derived
// population names. Anything missing makes a clause red for the wrong reason, which is the failure mode this
// whole increment is about.
const GATE_CLOSURE = [...new Set([
  'package.json',
  '.github/workflows/ci.yml',
  'tools/ci/proof-set.mjs',
  'docs/evidence/agents/sweep.mjs',
  'docs/evidence/ci/ci-wiring-proof.mjs',
  ...population.map((d) => d.file),
])];

const CLAUSES = ['§1', '§2', '§3', '§4', '§5', '§6', '§7', '§8', '§9', '§10', '§11'];

function gatePlane(tag, edits) {
  const files = new Map(GATE_CLOSURE.map((rel) => [rel, readSrc(rel)]));
  for (const e of edits) files.set(e.file, splice(files.get(e.file), e.from, e.to, `${tag} ${e.file}`));
  return makePlane(tag, files);
}

function runGate(dir) {
  const r = spawnSync(process.execPath, [join(dir, 'docs/evidence/ci/ci-wiring-proof.mjs')], { cwd: dir, encoding: 'utf8', windowsHide: true });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

const tagsOf = (out) => [...new Set([...out.matchAll(/^\[(§\d+)\]/gm)].map((m) => m[1]))];

const WF = '.github/workflows/ci.yml';
const PKG = 'package.json';
const RUNNER = 'tools/ci/proof-set.mjs';
const MUT = 'docs/evidence/studio/mutation-probe.mjs';
const BUILD_STEP = '      - name: Build\n        run: npm run build\n';
const PROOFS_STEP = '      - name: Evidence proofs\n        run: npm run verify:proofs\n';
// A10/A11's premise MOVED at v547: v545 retired the docker row, v546 the live-stack row, and v547 (amendment
// 530) the LAST one, so the shipped `EXCLUDED` is empty and an arm that quoted an entry would be editing bytes
// that do not exist — the needle-matched-nothing crash A10's first draft already hit in v540 for the opposite
// reason (its needle was ambiguous with the runner's own prose). So both arms now PLANT their exclusion by
// splicing one entry into the `EXCLUDED = []` DECLARATION: one for a proof that reaches nothing (§6's reach
// rule) and one whose reason is shorter than the floor (§6's "states nothing" rule). The needle is the
// declaration line, and the reason each planted row is unique is that the declaration occurs once.
const EXCLUDED_DECL = 'export const EXCLUDED = [];\n';

// A14's premise is the WHOLE population's declaration set, so its edits are DERIVED, not copied: at v528 one
// row declared a budget and deleting that one armed §9; by v540 six did, and the hardcoded delete left five
// standing — the gate exited 0, the arm's "no row declares" sentence never printed, and only a re-run could
// see it. An arm aimed at a moving population has to read the population at its own moment. The line itself is
// read through the receipt's `markerLine`, so the arm deletes EXACTLY the marker the receipt stamps — one grammar,
// two readers, and no way for the arm to grade a declaration the receipt would not notice changing.
const RUNNING_FILES = new Set(producer.splitSet(population).running.map((r) => r.file));
const DECLARED_MARKERS = population
  .filter((d) => RUNNING_FILES.has(d.file))
  .map((d) => {
    const line = markerLine(readSrc(d.file));
    return line ? { file: d.file, from: `${line}\n`, to: '' } : null;
  })
  .filter(Boolean);
assert.ok(DECLARED_MARKERS.length >= 2,
  `only ${DECLARED_MARKERS.length} running row(s) declare a budget, so A14's "nobody declares" arm would be deleting a single marker — its premise is that the shared grammar has several users, and that premise no longer holds`);

const GATE_ARMS = [
  { tag: 'C0-control', clause: null, edits: [], sig: null },
  { tag: 'A1-trigger-loses-master', clause: '§1', edits: [{ file: WF, from: 'branches: [main, master]', to: 'branches: [main]' }], sig: /does not include `master`/ },
  { tag: 'A2-proof-step-deleted', clause: '§2', edits: [{ file: WF, from: PROOFS_STEP, to: '' }], sig: /runs `npm run verify:proofs` in 0 steps/ },
  { tag: 'A3-proof-step-run-twice', clause: '§2', edits: [{ file: WF, from: PROOFS_STEP, to: `${PROOFS_STEP}${PROOFS_STEP}` }], sig: /in 2 steps/ },
  { tag: 'A4-pipe-true', clause: '§3', edits: [{ file: WF, from: '        run: npm run verify:proofs\n', to: '        run: npm run verify:proofs || true\n' }], sig: /a step swallows a failure/ },
  { tag: 'A5-continue-on-error', clause: '§3', edits: [{ file: WF, from: '      - name: Evidence proofs\n', to: '      - name: Evidence proofs\n        continue-on-error: true\n' }], sig: /a step swallows a failure/ },
  { tag: 'A6-set-plus-e', clause: '§3', edits: [{ file: WF, from: '          shopt -s nullglob\n', to: '          set +e\n          shopt -s nullglob\n' }], sig: /a step swallows a failure/ },
  { tag: 'A7-exemption-outlives-hazard', clause: '§3', edits: [{ file: WF, from: 'run: npm ci || npm install', to: 'run: npm ci' }], sig: /no longer carry a `\|\|`/ },
  { tag: 'A8-proofs-before-build', clause: '§4', edits: [
    // v540: v531 inserted the docker pre-pull between Build and Evidence proofs, so the old
    // PROOFS_STEP-after-BUILD_STEP adjacency needle matched nothing and this file crashed at A8 instead of
    // arming §4 — the first re-run since v531 found it. The reorder is expressed as delete-then-insert,
    // which does not care what other steps sit between the two.
    { file: WF, from: PROOFS_STEP, to: '' },
    { file: WF, from: BUILD_STEP, to: `${PROOFS_STEP}${BUILD_STEP}` },
  ], sig: /a proof that cannot import the build/ },
  { tag: 'A9-script-names-a-file-not-on-disk', clause: '§5', edits: [{ file: PKG, from: '"verify:credits": "node docs/evidence/studio/credits-proof.mjs"', to: '"verify:credits": "node docs/evidence/studio/credits-proof-gone.mjs"' }], sig: /not on disk/ },
  {
    tag: 'A10-exclusion-for-a-proof-that-reaches-nothing',
    clause: '§6',
    edits: [{
      file: RUNNER,
      from: EXCLUDED_DECL,
      to: "export const EXCLUDED = [\n  {\n    file: 'docs/evidence/studio/credits-proof.mjs',\n    needs: 'nothing at all — it is a pure node proof, so this exclusion is the rot the arm plants',\n  },\n];\n",
    }],
    sig: /nothing OUTSIDE its comments reaches/,
  },
  { tag: 'A11-exclusion-without-a-reason', clause: '§6', edits: [{ file: RUNNER, from: EXCLUDED_DECL, to: "export const EXCLUDED = [\n  {\n    file: 'docs/evidence/m7/service-suite-proof.mjs',\n    needs: 'docker',\n  },\n];\n" }], sig: /without naming what it needs/ },
  { tag: 'A12-runner-path-swapped', clause: '§7', edits: [{ file: PKG, from: '"verify:proofs": "node tools/ci/proof-set.mjs"', to: '"verify:proofs": "node tools/ci/proof-set-old.mjs"' }], sig: /must be the same door/ },
  { tag: 'A13-gate-not-in-its-own-set', clause: '§8', edits: [{ file: PKG, from: '    "verify:ci-wiring": "node docs/evidence/ci/ci-wiring-proof.mjs",\n', to: '' }], sig: /verify:ci-wiring is/ },
  { tag: 'A14-nobody-declares-a-budget', clause: '§9', edits: DECLARED_MARKERS, sig: /no row of the running set declares a budget/ },
  { tag: 'A15-budget-declared-twice', clause: '§9', edits: [{ file: MUT, from: '// sweep-budget-ms: 1200000\n', to: '// sweep-budget-ms: 1200000\n// sweep-budget-ms: 300000\n' }], sig: /budget is REFUSED/ },
  { tag: 'A16-build-node-too-old', clause: '§10', edits: [{ file: WF, from: 'node-version: 24', to: 'node-version: 20' }], sig: /below 22\.13/ },
  { tag: 'A17-job-ceiling-deleted', clause: '§11', edits: [{ file: WF, from: '    timeout-minutes: 60\n', to: '' }], sig: /declares no `timeout-minutes`/ },
  { tag: 'A18-ceiling-above-the-rows-own-worst-case', clause: '§11', edits: [{ file: WF, from: '    timeout-minutes: 60\n', to: '    timeout-minutes: 600\n' }], sig: /a ceiling at or above the sum of the row budgets/ },
  { tag: 'A19-token-widened-to-write', clause: '§11', edits: [{ file: WF, from: '      contents: read\n', to: '      contents: write\n' }], sig: /grants a WRITE scope/ },
  { tag: 'A20-ceiling-below-the-floor', clause: '§11', edits: [{ file: WF, from: '    timeout-minutes: 60\n', to: '    timeout-minutes: 4\n' }], sig: /below 5 it cannot let this build finish/ },
  { tag: 'A21-ceiling-not-a-number', clause: '§11', edits: [{ file: WF, from: '    timeout-minutes: 60\n', to: '    timeout-minutes: sixty\n' }], sig: /not a whole number of minutes/ },
  { tag: 'A22-permissions-block-deleted', clause: '§11', edits: [{ file: WF, from: '    permissions:\n      contents: read\n', to: '' }], sig: /declares no `permissions:` block/ },
  { tag: 'A23-permissions-block-emptied', clause: '§11', edits: [{ file: WF, from: '    permissions:\n      contents: read\n', to: '    permissions:\n' }], sig: /`permissions:` block is empty/ },
  { tag: 'A24-read-scope-dropped', clause: '§11', edits: [{ file: WF, from: '      contents: read\n', to: '      contents: none\n' }], sig: /do not include `contents: read`/ },
];

// A clause with no arm is a sentence nobody has tried to break, and an arm aimed at a clause the gate no longer
// prints grades nothing. v540's first re-run since v531 is why this closure exists: A8 had crashed at
// load since v531 and A14 had quietly stopped reaching its clause, and neither was visible from the table.
{
  const armed = new Set(GATE_ARMS.map((a) => a.clause).filter(Boolean));
  const unarmed = CLAUSES.filter((c) => !armed.has(c));
  const stray = [...armed].filter((c) => !CLAUSES.includes(c));
  assert.deepEqual(unarmed, [], `clause(s) ${unarmed.join(' ')} have no arm, so a refusal there is a sentence nobody has tried to break`);
  assert.deepEqual(stray, [], `arm(s) aim at ${stray.join(' ')}, which the gate does not print — those arms can only MISMATCH`);
}

// ── half 2: the runner ────────────────────────────────────────────────────────────────────────────────
// A synthetic plane, because the claim is about EXIT CODES and nothing else: NINE derived `verify:*` rows, all
// runnable stubs — v547 retired the shipped set's last excluded row, so a plane that still carried one would
// grade a shape the tree no longer has. R6 and R9 PLANT their exclusion by splicing it into the runner's
// `EXCLUDED = []` declaration — a ghost file for the stale-record arm, stub-a with a six-character reason for
// the reason-floor arm — so each fires on its own cause, and the floor (R8, two scripts deleted) can never
// answer for the wrong clause. Each stub appends to `ran.log`, which makes "this run executed nothing" a fact
// about a file rather than a reading of a sentence.
// Every stub declares its own generous budget. The runner arms pass `--budget 600` to the whole synthetic
// plane to prove a ROW's marker beats the fallback (R2b), and on a loaded box a healthy stub once took 0.7 s
// and was killed before the row under test could speak — the arm's subject is `c`, so no other row may be
// able to die first. A row with no marker is then only ever the arm's deliberate subject (R2c).
const stub = (name) => `// sweep-budget-ms: 120000\nimport { appendFileSync } from 'node:fs';\nappendFileSync('ran.log', '${name}\\n');\nconsole.log('${name} green');\n`;
const BASE_BODIES = {
  'docs/evidence/stub/a.mjs': stub('a'),
  'docs/evidence/stub/b.mjs': stub('b'),
  'docs/evidence/stub/c.mjs': stub('c'),
  'docs/evidence/stub/d.mjs': stub('d'),
  'docs/evidence/stub/e.mjs': stub('e'),
  'docs/evidence/stub/f.mjs': stub('f'),
  'docs/evidence/stub/g.mjs': stub('g'),
  'docs/evidence/stub/h.mjs': stub('h'),
  'docs/evidence/stub/i.mjs': stub('i'),
};
const BASE_SCRIPTS = {
  'verify:stub-a': 'node docs/evidence/stub/a.mjs',
  'verify:stub-b': 'node docs/evidence/stub/b.mjs',
  'verify:stub-c': 'node docs/evidence/stub/c.mjs',
  'verify:stub-d': 'node docs/evidence/stub/d.mjs',
  'verify:stub-e': 'node docs/evidence/stub/e.mjs',
  'verify:stub-f': 'node docs/evidence/stub/f.mjs',
  'verify:stub-g': 'node docs/evidence/stub/g.mjs',
  'verify:stub-h': 'node docs/evidence/stub/h.mjs',
  'verify:stub-i': 'node docs/evidence/stub/i.mjs',
};
const ALL_GREEN = /9\/9 green of a derived population of 9/;
const HANG = "import { appendFileSync } from 'node:fs';\nappendFileSync('ran.log', 'c\\n');\nsetTimeout(() => {}, 30000);\n";
// R2b's subject is row `c` and only row `c`: a computed budget of 30 s over a 1.5 s busy loop is the margin
// the arm needs, because on a loaded box the loop plus node startup measured 4.8 s — the same run in which
// healthy stubs took 2.6 s and 3.6 s — and a 3 000 ms marker turned the witness red instead of the runner.
const SLOW_WITH_MARKER = "// sweep-budget-ms: 30000\nimport { appendFileSync } from 'node:fs';\nappendFileSync('ran.log', 'c\\n');\nconst t = Date.now();\nwhile (Date.now() - t < 1500) {}\nconsole.log('c slow but inside its OWN budget');\n";
const SLOW_WITHOUT_MARKER = "import { appendFileSync } from 'node:fs';\nappendFileSync('ran.log', 'c\\n');\nconst t = Date.now();\nwhile (Date.now() - t < 1500) {}\nconsole.log('c slow with NO marker');\n";

function runnerPlane(tag, { scripts = BASE_SCRIPTS, bodies = BASE_BODIES, remove = [], edits = [] } = {}) {
  const files = new Map([
    [RUNNER, readSrc(RUNNER)],
    ['docs/evidence/agents/sweep.mjs', readSrc('docs/evidence/agents/sweep.mjs')],
    ['package.json', JSON.stringify({ name: 'nexus-ci-arms-plane', private: true, scripts }, null, 2)],
    ...Object.entries(bodies),
  ]);
  for (const rel of remove) files.delete(rel);
  for (const e of edits) files.set(e.file, splice(files.get(e.file), e.from, e.to, `${tag} ${e.file}`));
  return makePlane(tag, files);
}

function runRunner(dir, argv) {
  const r = spawnSync(process.execPath, [join(dir, 'tools/ci/proof-set.mjs'), ...argv], { cwd: dir, encoding: 'utf8', windowsHide: true });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

const RUNNER_ARMS = [
  { tag: 'R0-control', argv: [], code: 0, has: [ALL_GREEN], lacks: [/RED|TIMEOUT|NOTHING RAN/], ran: true },
  // THE headline: a proof that fails must fail the BUILD, and the cause must be readable, not a stack tail.
  {
    tag: 'R1-red-proof-fails-the-build',
    bodies: { ...BASE_BODIES, 'docs/evidence/stub/b.mjs': "console.error('AssertionError [ERR_ASSERTION]: the stub says the shipped number is wrong');\nprocess.exit(3);\n" },
    argv: [], code: 1, has: [/── verify:stub-b RED ──/, /the stub says the shipped number is wrong/], lacks: [/NOTHING RAN/], ran: true,
  },
  // A kill is not a failure: amendment 85's colour, read through the CI door rather than the agents sweep.
  { tag: 'R2-hang-is-TIMEOUT-not-RED', bodies: { ...BASE_BODIES, 'docs/evidence/stub/c.mjs': HANG }, argv: ['--budget', '600'], code: 1, has: [/── verify:stub-c TIMEOUT ──/], lacks: [/\bRED\b/], ran: true },
  // The row's own marker BEATS the command line, and a row without one does not: the pair that proves the
  // budget grammar is wired to milliseconds, not merely quoted.
  { tag: 'R2b-declared-budget-beats-fallback', bodies: { ...BASE_BODIES, 'docs/evidence/stub/c.mjs': SLOW_WITH_MARKER }, argv: ['--budget', '600'], code: 0, has: [/verify:stub-c\s+\S+ \[declared 30000ms\].*OK/, ALL_GREEN], lacks: [/TIMEOUT/], ran: true },
  { tag: 'R2c-undeclared-slow-row-is-killed', bodies: { ...BASE_BODIES, 'docs/evidence/stub/c.mjs': SLOW_WITHOUT_MARKER }, argv: ['--budget', '600'], code: 1, has: [/── verify:stub-c TIMEOUT ──/, /\[default 600ms\]/], lacks: [/\bRED\b/], ran: true },
  { tag: 'R3-only-typo-certifies-nothing', argv: ['--only', 'nosuchrow'], code: 1, has: [/NOTHING RAN/], lacks: [ALL_GREEN], ran: false },
  { tag: 'R3b-only-selects-one-row', argv: ['--only', 'stub-a'], code: 0, has: [/1\/1 green of a derived population of 9/], lacks: [/verify:stub-b/], ran: true, ranRows: 1 },
  { tag: 'R4-list-runs-nothing', argv: ['--list'], code: 0, has: [/RUN      verify:stub-a/, /derived population 9 = runs 9 \+ excluded 0/], lacks: [/EXCLUDED/, /OK \d/], ran: false },
  { tag: 'R5-dangling-script-is-red-not-skipped', remove: ['docs/evidence/stub/d.mjs'], argv: [], code: 1, has: [/points at a proof file that is not on disk/], lacks: [ALL_GREEN], ran: false },
  { tag: 'R6-stale-exclusion-named', edits: [{ file: RUNNER, from: EXCLUDED_DECL, to: "export const EXCLUDED = [\n  {\n    file: 'docs/evidence/stub/ghost.mjs',\n    needs: 'a daemon this synthetic plane never starts — the arm plants a record for a proof nobody wires',\n  },\n];\n" }], argv: [], code: 1, has: [/EXCLUDED names a file that is not in the derived population/], lacks: [ALL_GREEN], ran: false },
  // v555 — the stub's target is ASSEMBLED, not written whole: the runner's `distNeeded` reads this row's own
  // bytes for quoted `packages/…/dist` paths and would refuse to schedule the arms ("verify:arms needs
  // packages/fake/dist") because of a path that only ever exists inside a synthetic plane. The evaluated stub
  // still carries the whole literal, so R7 grades what it always graded.
  { tag: 'R7-missing-build-is-named-not-red', bodies: { ...BASE_BODIES, 'docs/evidence/stub/e.mjs': `${stub('e')}const target = './${'packages'}/fake/dist/index.js';\nconsole.log(target);\n` }, argv: [], code: 1, has: [/the build these proofs grade is not there/], lacks: [/── verify:stub-e RED ──/], ran: false },
  { tag: 'R8-population-floor', scripts: Object.fromEntries(Object.entries(BASE_SCRIPTS).filter(([k]) => !['verify:stub-d', 'verify:stub-e'].includes(k))), argv: [], code: 1, has: [/admits almost nothing/], lacks: [ALL_GREEN], ran: false },
  { tag: 'R9-exclusion-without-a-reason', edits: [{ file: RUNNER, from: EXCLUDED_DECL, to: "export const EXCLUDED = [\n  {\n    file: 'docs/evidence/stub/a.mjs',\n    needs: 'docker',\n  },\n];\n" }], argv: [], code: 1, has: [/is excluded without naming what it needs/], lacks: [ALL_GREEN], ran: false },
  { tag: 'R10-budget-must-be-a-number', argv: ['--budget', 'abc'], code: 1, has: [/a budget is a whole number of milliseconds/], lacks: [/running 9 derived/], ran: false },
  { tag: 'R11-budget-flag-without-a-value', argv: ['--budget', ''], code: 1, has: [/given without a number/], lacks: [/running 9 derived/], ran: false },
  // v550: an assertion's SUBJECT can sit on its second line, and the package-counts row's first ubuntu red was
  // unreadable because the runner printed line one and stopped. This stub reproduces the shape that red had —
  // a headline sentence followed by the per-row findings — and the arm is satisfied only when those findings
  // reach the log a human reads.
  {
    tag: 'R12-multiline-cause-reaches-the-log',
    bodies: { ...BASE_BODIES, 'docs/evidence/stub/b.mjs': "console.error('AssertionError [ERR_ASSERTION]: the package table drifted from the suites it describes:\\n  @nexus/stub-b: the table says 1/1; the suite answered 2/2\\n  @nexus/stub-c: the table says 3 files; the run produced 4');\nprocess.exit(3);\n" },
    argv: [], code: 1, has: [/── verify:stub-b RED ──/, /@nexus\/stub-b: the table says 1\/1; the suite answered 2\/2/, /@nexus\/stub-c: the table says 3 files; the run produced 4/], lacks: [/NOTHING RAN/], ran: true,
  },
  // The boundary of the same rule: a cause is the MESSAGE, not the stack under it. This arm is why R12 is a
  // narrowing rather than "print more" — the frames follow the message and must still be cut.
  {
    tag: 'R13-stack-frames-are-not-the-cause',
    bodies: { ...BASE_BODIES, 'docs/evidence/stub/b.mjs': "console.error('AssertionError [ERR_ASSERTION]: the number is wrong\\n    at Object.<anonymous> (/tmp/stub.mjs:3:9)\\n    at Module._compile (node:internal/modules/cjs/loader:1454:14)');\nprocess.exit(3);\n" },
    argv: [], code: 1, has: [/── verify:stub-b RED ──/, /the number is wrong/], lacks: [/at Object/, /Module\._compile/, /NOTHING RAN/], ran: true,
  },
  // v563 (amendment 538) — a GREEN row must say what it did, and a red row must not borrow the same channel.
  // R14 is satisfied only when the row's own LAST line reaches the log under the verdict and its earlier line
  // does not; R15 is the boundary — a red row's stdout is not a verdict, so its last line does not appear at
  // all and the cause (v550) is the only thing that speaks.
  {
    tag: 'R14-green-row-speaks-its-last-line',
    bodies: { ...BASE_BODIES, 'docs/evidence/stub/c.mjs': "console.log('first line, not the last');\nconsole.log(\"R14 the stub's last word\");\n" },
    argv: [], code: 0, has: [/verify:stub-c\s+\S+ .*OK/, /^ {6}\| R14 the stub's last word$/m, ALL_GREEN], lacks: [/^ {6}\| first line/m], ran: true,
  },
  {
    tag: 'R15-red-row-does-not-borrow-the-gutter',
    bodies: { ...BASE_BODIES, 'docs/evidence/stub/c.mjs': "console.log('R15 tail');\nconsole.error('AssertionError [ERR_ASSERTION]: R15 the stub refused');\nprocess.exit(3);\n" },
    argv: [], code: 1, has: [/── verify:stub-c RED ──/, /R15 the stub refused/], lacks: [/R15 tail/], ran: true,
  },
];

const results = [];
const mismatch = (arm, why) => results.push({ tag: arm.tag, ok: false, why });

try {
  // ── run half 1 ──────────────────────────────────────────────────────────────────────────────────────
  for (const arm of GATE_ARMS) {
    const dir = gatePlane(arm.tag, arm.edits);
    try {
      const g = runGate(dir);
      const passed = tagsOf(g.out);
      if (arm.clause === null) {
        if (g.code !== 0) mismatch(arm, `the control gate exited ${g.code}; its stderr:\n${g.err.slice(0, 700)}`);
        else if (passed.join(' ') !== CLAUSES.join(' ')) mismatch(arm, `the control printed [${passed.join(' ')}] but the gate has ${CLAUSES.length} clauses, so a clause ran silently and the control certifies less than it says`);
        else results.push({ tag: arm.tag, ok: true, note: `all ${CLAUSES.length} clauses printed, exit 0` });
      } else {
        // A clause may PRINT before it reddens: §6 walks its residue and logs each row as it checks it, so an arm
        // that aims at the third exclusion sees two `[§6]` lines on stdout and then a red. The honest rule is
        // therefore about the FRONTIER, not the count: everything below the aim printed, nothing above it did,
        // and the stderr carries the aimed clause's own words. First red hides the clauses below it (amendment
        // 88's lesson), and a partially printed clause hides nothing.
        const want = CLAUSES.slice(0, CLAUSES.indexOf(arm.clause));
        const beyond = passed.filter((t) => CLAUSES.indexOf(t) > CLAUSES.indexOf(arm.clause));
        const missing = want.filter((t) => !passed.includes(t));
        const bad = [];
        if (g.code !== 1) bad.push(`exit ${g.code}, predicted 1 (an arm that cannot redden the gate is not an arm)`);
        if (missing.length) bad.push(`${missing.join(' ')} did not print, so the red is EARLIER than this arm aimed`);
        if (beyond.length) bad.push(`${beyond.join(' ')} printed after the aim, so the red is LATER than this arm aimed`);
        if (arm.sig && !arm.sig.test(g.err)) bad.push(`stderr does not carry the clause's own words ${arm.sig} · stderr head: ${g.err.split('\n').slice(0, 4).join(' | ').slice(0, 300)}`);
        if (bad.length) mismatch(arm, bad.join(' · '));
        else results.push({ tag: arm.tag, ok: true, note: `first red at ${arm.clause}${passed.includes(arm.clause) ? ' (part-printed)' : ''}, ${want.length} clause(s) below it, none above, exit 1` });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // ── run half 2 ──────────────────────────────────────────────────────────────────────────────────────
  for (const arm of RUNNER_ARMS) {
    const dir = runnerPlane(arm.tag, arm);
    try {
      const r = runRunner(dir, arm.argv);
      const ranPath = join(dir, 'ran.log');
      const ranNames = existsSync(ranPath) ? readFileSync(ranPath, 'utf8').trim().split('\n').filter(Boolean) : [];
      const bad = [];
      if (r.code !== arm.code) bad.push(`exit ${r.code}, predicted ${arm.code} · output head: ${r.out.split('\n').slice(0, 6).join(' | ').slice(0, 400)}`);
      for (const re of arm.has) if (!re.test(r.out)) bad.push(`output does not match ${re} · head: ${r.out.split('\n').slice(0, 6).join(' | ').slice(0, 400)}`);
      for (const re of arm.lacks) if (re.test(r.out)) bad.push(`output matches the forbidden ${re}`);
      if (arm.ran && ranNames.length === 0) bad.push('no stub wrote ran.log, so the run graded a set that never executed');
      if (!arm.ran && ranNames.length > 0) bad.push(`${arm.tag} must run nothing, yet ${ranNames.length} stub(s) executed: ${ranNames.join(', ')}`);
      if (arm.ranRows && ranNames.length !== arm.ranRows) bad.push(`${ranNames.length} stub(s) ran, predicted ${arm.ranRows}`);
      if (bad.length) mismatch(arm, bad.join(' · '));
      else results.push({ tag: arm.tag, ok: true, note: `exit ${r.code} · ${ranNames.length} stub(s) executed` });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
} finally {
  rmSync(PLANE_ROOT, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.ok ? 'MATCHED ' : 'MISMATCH'} ${r.tag.padEnd(44)} ${r.ok ? r.note : r.why}`);
const reds = results.filter((r) => !r.ok);
console.log(`\n${results.length - reds.length}/${results.length} arms matched (${GATE_ARMS.length} gate incl. the control, ${RUNNER_ARMS.length} runner) · planes under ${PLANE_ROOT} removed: ${!existsSync(PLANE_ROOT)}`);
let ok = reds.length === 0;
if (!ok) {
  console.log(`receipt: ${RECEIPT_FILE} was NOT written — ${reds.length} arm(s) mismatched, and a receipt may only come from a run where every arm matched`);
} else {
  const nowSubjects = subjectsOf(SRC);
  const nowPopulation = populationOf(SRC);
  const moved = Object.keys(gradedSubjects).filter((k) => nowSubjects[k] !== gradedSubjects[k]);
  const popMoved = JSON.stringify(nowPopulation) !== JSON.stringify(gradedPopulation);
  if (moved.length || popMoved) {
    ok = false;
    console.log(`receipt: ${RECEIPT_FILE} was NOT written — the tree moved while the arms ran (${[...moved, ...(popMoved ? ['population'] : [])].join(', ')}); a receipt over bytes no arm graded is the staleness it exists to refuse`);
  } else {
    const receipt = makeReceipt({ root: SRC, armNames: results.map((r) => r.tag) });
    // v555 — the write is content-driven, not run-driven: a receipt that would differ from the committed one
    // only in `ranAt` is left alone, so scheduling this tool as a build row never re-stamps evidence bytes.
    // Content is compared field by field with the date dropped; `armNames` is in results order and `population`
    // is sorted by name, so two runs over the same bytes build byte-identical content.
    const stamp = (r) => JSON.stringify({ tool: r?.tool, scope: r?.scope, arms: r?.arms, matched: r?.matched, armNames: r?.armNames, subjects: r?.subjects, population: r?.population });
    const path = join(SRC, RECEIPT_FILE);
    const committed = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
    if (stamp(committed) === stamp(receipt)) {
      console.log(`receipt: ${RECEIPT_FILE} already stamps these bytes (${receipt.arms} arm(s), ${Object.keys(receipt.subjects).length} subject hash(es), ${receipt.population.length} derived row(s)) — left unchanged`);
    } else {
      writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
      console.log(`receipt: ${RECEIPT_FILE} stamps ${receipt.arms} arm(s), ${Object.keys(receipt.subjects).length} subject hash(es) and ${receipt.population.length} derived row(s) — commit it with the bytes it graded`);
    }
  }
}
process.exitCode = ok ? 0 : 1;
