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
// Run from the repository root:  node docs/evidence/ci/evidence-census-proof.mjs   (or: npm run verify:evidence-census)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sweep from '../agents/sweep.mjs';
import { derivePopulation, EXCLUDED, splitSet, unknownExclusions } from '../../../tools/ci/proof-set.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HERE = 'docs/evidence/ci/evidence-census-proof.mjs';
const EVIDENCE = 'docs/evidence/';
const SWEEP_DIR = 'docs/evidence/agents/';
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
    file: 'docs/evidence/ci/ci-wiring-arms.mjs',
    class: 'tool',
    run: 'node docs/evidence/ci/ci-wiring-arms.mjs',
    why: '32 witness arms that rewrite one byte-range of the wiring gate per arm; deliberately not a verify:* script so the derivation can never schedule a file whose job is to break its own subject (amendment 514\'s README records the choice)',
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

/**
 * The census itself: a pure function over (tracked list, scripts, exclusions, roster, swept population, a
 * reader). Everything below the CLI is exercised by the fixture arms at the bottom, so the refusals are
 * measured on a synthetic plane rather than assumed from reading the code.
 */
export function censusOf({ tracked, scripts, excluded = [], roster = [], swept = [], read }) {
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
    }
  }

  const unclassified = tracked.filter((f) => classes.get(f) === 'unclassified');
  const counts = { row: 0, helper: 0, swept: 0, tool: 0, deferred: 0, unclassified: 0 };
  for (const c of classes.values()) if (c in counts) counts[c]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total !== tracked.length) violations.push(`the census closes at ${total} over a population of ${tracked.length} — a module in no class is a module nobody decided about`);

  return { classes, rows, helpers, dangling, unclassified, counts, violations };
}

// ── the fixture arms: every refusal above, measured on a synthetic plane ─────────────────────────────
const BASE = () => ({
  files: {
    'docs/evidence/x/row-proof.mjs': "import { h } from './helper.mjs';\n",
    'docs/evidence/x/excluded-proof.mjs': '// the service this proof needs is not on this plane\n',
    'docs/evidence/x/helper.mjs': "import { l } from './leaf.mjs';\n",
    'docs/evidence/x/leaf.mjs': '\n',
    'docs/evidence/x/swept-proof.mjs': '\n',
    'docs/evidence/x/tool.mjs': "import { t } from './tool-helper.mjs';\n",
    'docs/evidence/x/tool-helper.mjs': '\n',
  },
  scripts: {
    'verify:row': 'node docs/evidence/x/row-proof.mjs',
    'verify:excluded': 'node docs/evidence/x/excluded-proof.mjs',
    'verify:runner': 'node tools/ci/runner.mjs',
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
      measured: '1.0 s on a synthetic plane, 2026-10-28',
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
];

function runArms() {
  const results = ARMS.map(([name, patch, check]) => {
    const f = BASE();
    patch(f);
    const tracked = (f.tracked ?? Object.keys(f.files)).slice().sort();
    const read = (p) => (Object.prototype.hasOwnProperty.call(f.files, p) ? f.files[p] : null);
    const report = censusOf({ tracked, scripts: f.scripts, excluded: f.excluded, roster: f.roster, swept: f.swept, read });
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
  console.log(`[arms] ${results.length}/${results.length} MATCHED — each refusal rises from the fixture the arm rewrites, and the prose-import arm proves the tokenizer is the sweep's`);
}

async function main() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const tracked = (await sweep.gitText(['ls-files', '--', 'docs/evidence'], ROOT))
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => MODULE_RE.test(s))
    .sort();
  assert.ok(tracked.length >= 40, `git ls-files returned ${tracked.length} evidence modules — a population that small is a broken filter, not a repository`);

  const indexSwept = tracked.filter((f) => f.startsWith(SWEEP_DIR) && f.endsWith('-proof.mjs')).sort();
  const headSwept = (await sweep.trackedProofs('HEAD', ROOT)).slice().sort();
  assert.deepEqual(
    headSwept,
    indexSwept,
    `the index and HEAD disagree about the agents proofs: only-in-index ${JSON.stringify(indexSwept.filter((f) => !headSwept.includes(f)))} · only-in-HEAD ${JSON.stringify(headSwept.filter((f) => !indexSwept.includes(f)))} — the sweep's population is HEAD's, so a staged-but-uncommitted proof is invisible to it until it is committed`,
  );

  const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null);
  const report = censusOf({ tracked, scripts: pkg.scripts, excluded: EXCLUDED, roster: ROSTER, swept: headSwept, read });
  assert.deepEqual(report.violations, [], `the census is RED:\n  ${report.violations.join('\n  ')}`);
  assert.deepEqual(report.unclassified, [], `the census found modules nobody has decided about: ${report.unclassified.join(', ')} — each must become a verify row, an EXCLUDED row, a reachable helper, or a ROSTER entry with a falsifiable reason`);

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

  runArms();

  console.log(`\nevidence census: ${tracked.length} tracked modules close as ${report.counts.row} row + ${report.counts.helper} helper + ${report.counts.swept} swept + ${report.counts.tool} tool + ${report.counts.deferred} deferred · ${report.counts.unclassified} unclassified · rows ${running.length}+${residue.length} · every row file the commit owns`);
}

if (sweep.isMainModule(import.meta.url)) await main();
