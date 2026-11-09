// NEXUS v528 (docs/evidence/ci) — THE WIRING THAT MAKES A RED PROOF FAIL THE BUILD IS ITSELF GRADED
// (ADR 0016 amendment 514).
//
// Why this exists, stated the way §60 requires: amendment 513 re-aimed two stale m7 needles and then named
// the hole it had NOT closed — a red proof still certified nothing, because `.github/workflows/ci.yml`, the
// repository's only workflow, ran no `verify:*` step and its push trigger named only `main`, a lineage with
// no merge base with the `master` this lane pushes. Measured 2026-10-28 before the repair: `git merge-base
// master origin/main` exits 1, and `gh run list` returns ZERO runs for the whole repository — the workflow
// had never executed once, so every "CI would have caught it" sentence in this project's records was about a
// machine that does not run.
//
// So the wiring is a subject, not a footnote. This proof reads the shipped workflows as bytes and refuses,
// clause by clause, each way the fix could rot back into the hole: the trigger losing this branch, the proof
// step disappearing, the step swallowing a failure (`|| true`, `continue-on-error`), the proofs running
// before the build they grade, and — the one a hand-written list always ends up in — the derived set and the
// rule that derives it disagreeing. §6 therefore IMPORTS the runner's own `PROOF_COMMAND`, `EXCLUDED` and
// `derivePopulation` rather than retyping them: a gate that re-states a rule can go green while the producer
// disagrees, which is amendment 513's stale needle with the colours reversed.
//
// §9 walks the same road for the milliseconds: a row declares its own budget in a first-column comment the
// agents sweep named, and the CI reader must answer the SAME way that reader does on the same
// bytes — obeyed, defaulted, refused, and above all blind to a marker quoted inside a string. §10 charges the
// Node the build selects, because the proofs import a type-stripper that a lower Node does not have. §11
// charges the job's own envelope: the row budgets bound the proofs step and nothing above it, so the job
// declares a ceiling that is TIGHTER than their sum, and a token that can only read.
//
// §12 charges the TAIL of each row's own source. The runner prints a green row's last line into its gutter, so
// a row that deletes a temp directory after it reports its measurement is remembered for the deletion; the
// hosted log of run 41421600776 showed eight rows in exactly that shape. Order is invisible to every other
// clause here, and a reorder is one edit away from coming back.
//
// §13 charges the LENGTH of that same tail. A gutter is bounded, so a sentence longer than the bound is
// severed; run 41433663171 counted eleven of 107 gutters sitting at exactly the bound, and nine rows whose
// static text alone exceeds it — those nine can never print whole. §13 asks the runner's own clip what would
// happen to each row's last line and refuses the guaranteed cut, leaving the length that depends on numbers
// the row interpolates to the marker v591 added.
//
// §8 makes this file self-reference its own admission: the script `verify:ci-wiring` must exist and point
// here, so the door that guards the wiring is itself walked by the wiring it guards.
//
// Run from the repository root:  node docs/evidence/ci/ci-wiring-proof.mjs   (or: npm run verify:ci-wiring)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = '.github/workflows/ci.yml';
const RUNNER = 'tools/ci/proof-set.mjs';

// The producer, imported — not paraphrased. Importing it does not run it: the CLI is behind a main-module guard.
const producer = await import(new URL('../../../tools/ci/proof-set.mjs', import.meta.url).href);
const { PROOF_COMMAND, EXCLUDED, derivePopulation, danglingTargets, unknownExclusions, splitSet } = producer;
assert.ok(PROOF_COMMAND instanceof RegExp && typeof derivePopulation === 'function' && Array.isArray(EXCLUDED),
  'the runner exports its own rule — a gate that had to COPY the regex would be grading a copy, not the wiring');
assert.ok(typeof producer.lastLineOf === 'function' && Number.isInteger(producer.GUTTER_BOUND_BYTES),
  '§13 measures a row against the clip the runner actually uses; if the runner stopped exporting it, this clause would be quoting a number the producer no longer obeys');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/**
 * The subset of YAML this repository's workflow is written in: a `steps:` sequence whose entries carry
 * `name:`, `uses:` and a `run:` that is either a single line or a `|` block scalar. Refusing a shape this
 * reader cannot parse is deliberate: silently grading half a step is how a swallow hides.
 */
function stepsOf(text, label = WORKFLOW) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s+steps:\s*$/.test(l));
  assert.ok(at >= 0, `${label}: no "steps:" sequence, so nothing here can say which commands the build runs`);
  const first = lines.slice(at + 1).find((l) => /^\s*-\s/.test(l));
  assert.ok(first, `${label}: \`steps:\` has no entries`);
  const indent = first.match(/^\s*/)[0].length;
  const blocks = [];
  let cur = null;
  for (const raw of lines.slice(at + 1)) {
    if (raw.trim() === '') { if (cur) cur.body.push(''); continue; }
    const ind = raw.match(/^\s*/)[0].length;
    if (ind === indent && /^\s*-\s/.test(raw)) { if (cur) blocks.push(cur); cur = { body: [raw.slice(indent + 2)] }; continue; }
    if (ind < indent) break;
    if (cur) cur.body.push(raw.slice(Math.min(indent + 2, ind)));
  }
  if (cur) blocks.push(cur);
  return blocks.map((b, index) => {
    const body = b.body.join('\n');
    const runLine = b.body.findIndex((l) => /^run:\s*/.test(l));
    let run = null;
    if (runLine >= 0) {
      const inline = b.body[runLine].replace(/^run:\s*/, '').trim();
      if (inline === '|' || inline === '>') {
        const taken = [];
        for (const l of b.body.slice(runLine + 1)) {
          if (/^\S/.test(l) || /^[a-z]+:/.test(l)) break;
          taken.push(l);
        }
        run = taken.join('\n').trim();
      } else run = inline;
    }
    const field = (k) => (body.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1]?.trim() ?? null;
    return { index, name: field('name'), uses: field('uses'), run, continueOnError: /continue-on-error:\s*true/.test(body), raw: body };
  });
}

const wfExists = existsSync(join(ROOT, WORKFLOW));
assert.ok(wfExists, `${WORKFLOW} is not in the tree — the build has no workflow, so no proof can fail it`);
const wf = readFileSync(join(ROOT, WORKFLOW), 'utf8');

// ── §1 the trigger covers the branch this lane pushes ───────────────────────────────────────────────
{
  const m = wf.match(/^\s*branches:\s*\[([^\]]*)\]/m);
  assert.ok(m, `${WORKFLOW}: the push trigger has no inline \`branches: [...]\` list, so this clause cannot read it`);
  const listed = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(listed.includes('master'), `the CI push trigger is [${listed.join(', ')}] and does not include \`master\`, the branch this lane pushes — amendment 514 measured that the workflow therefore never ran once`);
  console.log(`[§1] push branches [${listed.join(', ')}] includes the branch this lane pushes`);
}

const steps = stepsOf(wf);
assert.ok(steps.length >= 5, `${WORKFLOW}: the job has ${steps.length} steps — too few to be the build this clause set describes`);

// ── §2 a step runs the derived proof set ────────────────────────────────────────────────────────────
const proofSteps = steps.filter((s) => s.run && /npm run verify:proofs/.test(s.run));
{
  assert.equal(proofSteps.length, 1, `the workflow runs \`npm run verify:proofs\` in ${proofSteps.length} steps — a set that is run twice is a different set, and zero is the hole this increment closed`);
  console.log(`[§2] step #${proofSteps[0].index} "${proofSteps[0].name}" runs the derived proof set`);
}

// ── §3 the gate steps swallow nothing ───────────────────────────────────────────────────────────────
// Two halves, because `||` means two different things. A swallow is a `||` (or `continue-on-error`, or
// `set +e`) whose RIGHT SIDE can end the step happily: that is a gate that cannot go red. The other `||`
// picks between two ways of doing a job, or ends in `exit 1`, and is disclosed here by step IDENTITY with
// its reason — a position-keyed skip list would let the next `|| true` inherit an earlier step's exemption.
const FALLBACK_DISCLOSURE = [
  { step: 'Install (workspace root)', why: 'the right side is `npm install`, an ALTERNATIVE way to obtain bytes; no verdict is read here, so nothing can be swallowed' },
  { step: 'ADR index integrity', why: 'every `||` in the loop body ends in `exit 1`, so the branch is fail-CLOSED: it is the way bash spells "and then fail"' },
];
{
  const swallow = (s) => s.continueOnError || /\|\|\s*(true|:)\b/.test(s.run || '') || /;\s*true\b/.test(s.run || '') || /set \+e/.test(s.run || '');
  const offenders = steps.filter(swallow);
  assert.deepEqual(offenders.map((s) => `${s.index}:${s.name ?? s.uses}`), [], `a step swallows a failure: ${offenders.map((s) => `${s.name ?? s.uses} -> ${JSON.stringify(s.run ?? s.uses)}`).join(' | ')} — a gate that cannot go red is not a gate`);
  const carriers = steps.filter((s) => (s.run || '').includes('||'));
  const disclosed = new Set(FALLBACK_DISCLOSURE.map((d) => d.step));
  const undeclared = carriers.filter((s) => !disclosed.has(s.name || ''));
  assert.deepEqual(undeclared.map((s) => s.name ?? s.uses), [], `a step uses \`||\` and is not disclosed: ${undeclared.map((s) => `${s.name ?? s.uses} -> ${JSON.stringify(s.run)}`).join(' | ')} — add it to FALLBACK_DISCLOSURE ONLY with the reason it cannot swallow a verdict`);
  const missing = [...disclosed].filter((n) => !carriers.some((s) => s.name === n));
  assert.deepEqual(missing, [], `FALLBACK_DISCLOSURE names steps that no longer carry a \`||\`: ${missing.join(', ')} — an exemption outliving its hazard is a stale record, which is this increment\'s own subject`);
  for (const d of FALLBACK_DISCLOSURE) assert.ok(d.why.length >= 30, `${d.step} is disclosed with a reason of ${JSON.stringify(d.why)}`);
  console.log(`[§3] ${steps.length} steps, none with continue-on-error or a swallowed verdict; ${carriers.length} \`||\` carriers, each disclosed by name (${carriers.map((s) => s.name).join(', ')})`);
}

// ── §4 the proofs run AFTER the build whose bytes they grade ────────────────────────────────────────
{
  const buildStep = steps.find((s) => /npm run build/.test(s.run || ''));
  assert.ok(buildStep, 'no step runs `npm run build`, so the `dist` these proofs resolve against their cwd is nothing');
  assert.ok(buildStep.index < proofSteps[0].index, `the build is step #${buildStep.index} but the proof set is step #${proofSteps[0].index} — a proof that cannot import the build reddens the job for the wrong reason, which is how a real red gets explained away`);
  console.log(`[§4] build step #${buildStep.index} precedes the proof step #${proofSteps[0].index}`);
}

// ── §5 the population: derived by the producer, and every door it names is on disk ──────────────────
const population = derivePopulation(pkg.scripts);
{
  assert.ok(population.length >= 8, `the derived population is ${population.length} — a rule that admits almost nothing is a door, not a census`);
  assert.deepEqual(danglingTargets(population), [], 'a verify:* script points at a proof file that is not on disk');
  assert.deepEqual(unknownExclusions(population), [], 'the runner excludes a file that is not in the derived population — an exclusion for a proof nobody wires is a stale record');
  const { running, residue } = splitSet(population);
  assert.equal(running.length + residue.length, population.length, `running + residue (${running.length} + ${residue.length}) does not close the population (${population.length}) — a proof in neither list is a proof nobody has decided about`);
  console.log(`[§5] derived population ${population.length} = runs ${running.length} + named residue ${residue.length}, every target on disk`);
}

// ── §6 the residue is named by a reach, not by a feeling ────────────────────────────────────────────
// An exclusion must point at the external thing the proof really touches, read out of that proof's own bytes.
// Without this clause "needs docker" is a sentence about the author's convenience, and proofs would leave the
// build one excuse at a time — which is the hole §5's closure cannot see because the file is still wired.
//
// The reach is searched OUTSIDE the comments, because amendment 89 already settled what a quotation is worth:
// a header line that says "this needs docker" is prose, and prose is the channel a proof uses to describe
// itself, not to do anything. Measured on the three rows the build does not run: the raw byte search found
// `PostgreS`/`PostgreS`/`mvn` — the first two of which are the image name inside a comment — while the
// comment-free view finds `createServer`, `tools/harness` and `mvn`, each of which is code the proof runs.
// The bound that stays: a STRING in code may still name a service the proof never opens, so §6 refuses an
// empty reason and prints every residue on every run rather than pretending a word is a witness.
//
// v547 (amendment 530): the residue is EMPTY — the last exclusion (service-suite) was retired after its stated
// need was measured false. The clause prints that emptiness rather than falling silent, because a § that stops
// printing is a sentence nobody can see; the arms that aim here (A10/A11) now PLANT an exclusion by splicing
// one into the producer's `EXCLUDED = []` declaration, since a rule with no user in the tree is still a rule
// somebody has to try to break.
{
  const REACH = /docker|mvn|postgres|pgvector|tools\/harness|createServer|\.listen\(|localhost|127\.0\.0\.1|\bfetch\(/i;
  const outsideComments = (src) => {
    const kept = [];
    let inBlock = false;
    for (const line of String(src).split(/\r?\n/)) {
      const t = line.trim();
      if (inBlock) { if (t.includes('*/')) inBlock = false; continue; }
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) { if (t.startsWith('/*') && !t.includes('*/')) inBlock = true; continue; }
      kept.push(line);
    }
    return kept.join('\n');
  };
  if (EXCLUDED.length === 0) {
    console.log(`[§6] the residue is EMPTY at this ref — every one of the ${population.length} derived rows runs; an exclusion added later must still name a reach this clause can read in CODE`);
  }
  for (const e of EXCLUDED) {
    assert.ok((e.needs || '').length >= 20, `${e.file} is excluded without naming what it needs (reason ${JSON.stringify(e.needs)})`);
    const src = readFileSync(join(ROOT, e.file), 'utf8');
    const inProse = src.match(REACH);
    const hit = outsideComments(src).match(REACH);
    assert.ok(hit, `${e.file} is excluded as needing "${e.needs}", yet nothing OUTSIDE its comments reaches a docker daemon, a maven/postgres client, a harness or a socket${inProse ? ` — the only place the word appears is prose (a comment says ${JSON.stringify(inProse[0])}), and a comment is not a dependency` : ''} — so this exclusion retires a proof the build COULD run`);
    console.log(`[§6] residue ${e.file} reaches ${JSON.stringify(hit[0])} in code — ${e.needs.slice(0, 48)}`);
  }
}

// ── §7 the runner the workflow calls is the runner shipped here ─────────────────────────────────────
{
  assert.equal(pkg.scripts['verify:proofs'], `node ${RUNNER}`, `verify:proofs is ${JSON.stringify(pkg.scripts['verify:proofs'])}, not \`node ${RUNNER}\` — the workflow's step and the script it names must be the same door`);
  assert.ok(existsSync(join(ROOT, RUNNER)), `${RUNNER} is not on disk, so the CI step names a file that does not exist`);
  console.log(`[§7] verify:proofs -> ${RUNNER}, which is on disk`);
}

// ── §8 the door that guards the wiring is inside the wiring ────────────────────────────────────────
{
  const here = 'docs/evidence/ci/ci-wiring-proof.mjs';
  assert.equal(pkg.scripts['verify:ci-wiring'], `node ${here}`, `verify:ci-wiring is ${JSON.stringify(pkg.scripts['verify:ci-wiring'])}, not \`node ${here}\` — a gate that the set it guards does not run can rot silently, which is the exact failure this increment is about`);
  const { running } = splitSet(population);
  assert.ok(running.some((r) => r.file === here), `${here} is excluded from the set, so this proof grades the build while the build never grades it`);
  console.log(`[§8] ${here} is in the running set it just enumerated (${running.length} rows)`);
}

// ── §9 the row's budget is read through ONE grammar ────────────────────────────────────────────────
// Amendment 85 made a proof's budget the ROW's and a kill a different verdict from a failure; amendment 94
// made the marker only legible where the row can actually speak (first column, outside any string or block
// comment). A CI runner that re-implements that grammar with a raw regex would let a proof buy an hour by
// quoting a sentence — and the two grammars would drift with nobody noticing, because both would be green.
// So these cases run through the CI reader AND through the agents sweep's own function, and the two answers
// must agree on every one. The shapes are the ones amendment 94 shipped, in both directions: obeyed, refused,
// and ignored-because-sheltered.
{
  const sweep = await import('../agents/sweep.mjs');
  const CASES = [
    { file: 'declared.mjs', text: '// sweep-budget-ms: 900000\n', ms: 900_000, from: 'declared', why: 'a first-column declaration is OBEYED' },
    { file: 'default.mjs', text: 'console.log(1);\n', ms: producer.DEFAULT_BUDGET_MS, from: 'default', why: 'no declaration, so the fallback the runner names' },
    { file: 'quoted.mjs', text: 'const s = "// sweep-budget-ms: 3600000";\n', ms: producer.DEFAULT_BUDGET_MS, from: 'default', why: 'QUOTED into a string it buys NOTHING' },
    { file: 'sheltered.mjs', text: '/*\n// sweep-budget-ms: 3600000\n*/\n', ms: producer.DEFAULT_BUDGET_MS, from: 'default', why: 'inside a block comment it buys nothing either' },
    { file: 'over.mjs', text: '// sweep-budget-ms: 3600001\n', ms: producer.DEFAULT_BUDGET_MS, from: 'refused', why: 'above the ceiling a human has to raise --budget' },
    { file: 'twice.mjs', text: '// sweep-budget-ms: 300000\n// sweep-budget-ms: 600000\n', ms: producer.DEFAULT_BUDGET_MS, from: 'refused', why: 'a row names its budget ONCE' },
  ];
  const box = mkdtempSync(join(tmpdir(), 'nexus-ci-budget-'));
  try {
    for (const c of CASES) writeFileSync(join(box, c.file), c.text, 'utf8');
    for (const c of CASES) {
      const viaRunner = producer.rowBudgetOf(c.file, producer.DEFAULT_BUDGET_MS, box);
      const viaSweep = sweep.rowBudget(c.text, producer.DEFAULT_BUDGET_MS);
      assert.deepEqual({ ms: viaRunner.ms, from: viaRunner.from }, { ms: viaSweep.budgetMs, from: viaSweep.budgetSource },
        `case ${c.file} (${c.why}) reads ${viaRunner.from} ${viaRunner.ms} through the CI runner but ${viaSweep.budgetSource} ${viaSweep.budgetMs} through the agents sweep — two grammars for one marker is the drift this clause exists to refuse`);
      assert.equal(viaRunner.ms, c.ms, `${c.file}: expected ${c.ms}ms, got ${viaRunner.ms} (${c.why})`);
      assert.equal(viaRunner.from, c.from, `${c.file}: expected source ${c.from}, got ${viaRunner.from} (${c.why})`);
      if (c.from === 'refused') assert.ok((viaRunner.note || '').length >= 20, `${c.file} is refused without a note: ${JSON.stringify(viaRunner.note)}`);
    }
    const { running } = splitSet(population);
    const budgets = running.map((r) => ({ ...r, budget: producer.rowBudgetOf(r.file) }));
    // A REFUSED row is a row that asked for milliseconds and was not heard. The runner falls back and prints a
    // note, which is honest, but a note nobody reads at the moment of the ship is how the slowest row in the
    // set quietly gets 240 000 ms again. This sentence wrote its own refusal into a header comment before the
    // landing run printed it, which is the whole reason the clause exists. It is read BEFORE the declared floor
    // below, so a mis-spelled marker reddens with the note that names it instead of with "nothing is declared",
    // which would also be true and would send the reader to the wrong file.
    const refused = budgets.filter((b) => b.budget.from === 'refused');
    assert.deepEqual(refused.map((b) => `${b.name}: ${b.budget.note}`), [], `a running row's budget is REFUSED, so it silently runs on the fallback: ${refused.map((b) => `${b.name} -> ${b.budget.note}`).join(' | ')} — the marker must be one first-column comment naming a whole number, and prose that shows the marker belongs inside a block comment or a string, where it buys nothing`);
    // A guard nobody can reach is not a guard: the grammar must already be armed by at least one real row, or
    // §9 grades a channel the population never uses.
    const declared = budgets.filter((b) => b.budget.from === 'declared');
    assert.ok(declared.length >= 1, `no row of the running set declares a budget, so the shared grammar is dead code here — name the slow proof's milliseconds in its own header (amendment 85)`);
    console.log(`[§9] ${CASES.length} budget-grammar cases agree between the CI runner and the agents sweep · ${declared.length} row(s) of ${running.length} declare their own: ${declared.map((d) => `${d.name}=${d.budget.ms}ms`).join(', ')} · 0 refused`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

// ── §10 the build's Node is one the proofs can run on ──────────────────────────────────────────────
// Several proofs strip TypeScript out of the modules they grade through `node:module`'s type-stripper, which
// arrived in Node 22.13. Nothing in `engines` says that — it reads ">=20" — so the only place the requirement
// lives is the workflow, and a reader who lowered it there would turn 12 green rows into a red that names no
// cause. This clause charges the version the build actually selects.
let buildNodeMajor = 0;
{
  const step = steps.find((s) => /setup-node/.test(s.uses || ''));
  assert.ok(step, `${WORKFLOW}: no actions/setup-node step, so the Node these proofs run under is whatever the image happens to hold`);
  const pinned = step.raw.match(/node-version:\s*['"]?(\d+)/);
  assert.ok(pinned, `${WORKFLOW}: the setup-node step pins no \`node-version:\` number, so this clause cannot read it`);
  buildNodeMajor = Number(pinned[1]);
  assert.ok(buildNodeMajor >= 22, `the build selects Node ${buildNodeMajor}, which is below 22.13 — the m7 proofs import node:module's stripTypeScriptTypes and would redden for the runner's version, not for the code`);
  const { stripTypeScriptTypes } = await import('node:module');
  assert.equal(typeof stripTypeScriptTypes, 'function', `this grading box (${process.version}) has no stripTypeScriptTypes, so the proofs cannot be read here at all`);
  console.log(`[§10] build Node major ${buildNodeMajor} >= 22 · this box ${process.version} carries the type-stripper the proofs import`);
}

// ── §11 the job's own envelope: a ceiling above the per-row budgets, and a token that can only read ──
// The per-row budgets of §9 bound the PROOFS step. Nothing bounds `npm ci`, typecheck, lint, test, build or
// `docker pull`: a stalled network call there is bounded only by the platform default (6 h), and the row
// budgets cannot see it because they start counting later. So the job declares its own ceiling, and this
// clause refuses both ways it can rot: the ceiling disappearing, and the ceiling being raised past the rows'
// own worst case — at which point it is not an outer bound at all, just the rows' budgets in another unit.
// The token is the same shape one level down: the default is broader than this workflow's read-only uses.
let jobTimeoutMinutes = 0;
{
  const jobHead = (wf.match(/^jobs:[\s\S]*?^ {4}steps:/m) || [])[0] || '';
  const field = (k) => (jobHead.match(new RegExp(`^ {4}${k}:\\s*(.*)$`, 'm')) || [])[1]?.trim() ?? null;
  const declaredTimeout = field('timeout-minutes');
  assert.ok(declaredTimeout !== null, `${WORKFLOW}: the job declares no \`timeout-minutes\`, so a stalled \`npm ci\`, typecheck, lint, test, build or \`docker pull\` is bounded only by the platform default — the proofs' per-row budgets bound the proofs step, not the steps above it`);
  assert.match(declaredTimeout, /^\d+$/, `the job's \`timeout-minutes\` is ${JSON.stringify(declaredTimeout)}, not a whole number of minutes`);
  jobTimeoutMinutes = Number(declaredTimeout);
  assert.ok(jobTimeoutMinutes >= 5, `the job ceiling is ${jobTimeoutMinutes} min — below 5 it cannot let this build finish, so it would redden every run rather than bound a hang`);
  const { running } = splitSet(population);
  const worstRowMs = running.reduce((s, r) => s + producer.rowBudgetOf(r.file).ms, 0);
  assert.ok(jobTimeoutMinutes * 60_000 < worstRowMs, `the job ceiling is ${jobTimeoutMinutes} min (${jobTimeoutMinutes * 60_000}ms) and the ${running.length} rows' own worst case is ${worstRowMs}ms (${Math.ceil(worstRowMs / 60_000)} min) — a ceiling at or above the sum of the row budgets is not an outer bound; it is the rows' budgets wearing another unit, and the steps ABOVE the proofs stay unbounded`);
  const permsAt = jobHead.split(/\r?\n/).findIndex((l) => /^ {4}permissions:\s*$/.test(l));
  assert.ok(permsAt >= 0, `${WORKFLOW}: the job declares no \`permissions:\` block, so the token is whatever the repository default is — broader than this workflow's read-only uses`);
  const perms = [];
  for (const line of jobHead.split(/\r?\n/).slice(permsAt + 1)) {
    if (!/^\s{6,}\S/.test(line)) break;
    perms.push(line.trim());
  }
  assert.ok(perms.length, `${WORKFLOW}: the job's \`permissions:\` block is empty, so it narrows nothing`);
  // The refusal before the adequacy check, for §9's reason: a write scope is the hazard, and the
  // read-inclusion sentence ("cannot tell a narrowed token from an empty one") misnames it. A19 found this
  // by widening the token to `contents: write` and landing one assertion EARLIER than the sentence it names.
  const writes = perms.filter((p) => /\bwrite\b/.test(p));
  assert.deepEqual(writes, [], `the job's token grants a WRITE scope: ${writes.join(', ')} — this workflow checks out, typechecks, lints, tests, builds and runs proofs; nothing it does writes back to the repository`);
  assert.ok(perms.includes('contents: read'), `the job's token scopes are [${perms.join(', ')}] and do not include \`contents: read\`, which actions/checkout needs — this clause cannot tell a narrowed token from an empty one otherwise`);
  console.log(`[§11] job ceiling ${jobTimeoutMinutes} min is BELOW the rows' own worst case ${Math.ceil(worstRowMs / 60_000)} min (${running.length} rows) · token narrowed to [${perms.join(', ')}] · no write scope`);
}

// ── §12 a green row's LAST line says what it graded, not what it deleted ────────────────────────
// v563 (amendment 538) made the runner print a green row's own last STDOUT line into that row's gutter, and
// v566 (541) made that gutter unconditional, so for the rows that pass the gutter is the ONE sentence the
// hosted log keeps. Run 41421600776 counted 106 OK lines against 106 gutters and named eight of them reading
// `[cleanup] throwaway repos removed` and friends: rows that had measured something, remembered only for
// deleting a temp directory. v568 moved the eight, and a move is the shape that rots silently — the next print
// added BELOW a summary restores the defect for that row alone, and nothing between here and the hosted run
// says so. So this clause refuses the source-order version of it for every running row.
// It is a PROXY and is stated as one: what a row really prints last is knowable only from the run, because a
// print can sit inside a branch and `console.log(fmt(x))` says nothing readable at the byte level. The proxy
// stays honest three ways — it keys on the TAG a line opens with rather than on its subject, so a row may end
// on any sentence it likes; it walks only the derived running set, so a helper or a human-run tool that ends
// on cleanup is nobody's business; and a refusal quotes the file and the line, so the remedy comes with the
// message. A row that prints nothing is not an offender either: v566's gutter says `(the row printed nothing)`,
// which is the true sentence for that row, and R16/R17 arm the channel.
const { running } = splitSet(population);

/**
 * The last readable `console.log(` call in a row's SOURCE, as `{ line, literal }`: `literal` is the argument's
 * own text between its opening and closing quote on that line, and is `null` when the call cannot be read that
 * way (no opening quote, a template that continues on the next line, a call whose argument is an expression).
 * §12 and §13 share this one scan so the two clauses cannot disagree about which line is the tail — and both
 * are proxies for the same unknowable thing, since a print inside a branch is invisible to any reader of bytes.
 */
function lastPrintCall(path) {
  const lines = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const at = lines[i].lastIndexOf('console.log(');
    if (at < 0) continue;
    // A commented-out print is not a print. Checking the bytes BEFORE the call on its own line is the whole
    // of the parsing this gate does — the same bound every clause here works under, since it reads bytes,
    // not an AST.
    if (/\/\*|^\s*(\*|\/\/)/.test(lines[i].slice(0, at))) continue;
    const rest = lines[i].slice(at + 'console.log('.length);
    const open = /^[`'"]/.exec(rest.replace(/^\s+/, ''));
    if (!open) return { line: lines[i].trim(), literal: null };
    const quoted = rest.slice(rest.search(/\S/));
    const q = quoted[0];
    let end = -1;
    for (let k = 1; k < quoted.length; k++) {
      if (quoted[k] === '\\') k++;
      else if (quoted[k] === q) { end = k; break; }
    }
    // The FIRST readable call from the end is the tail whether or not it can be read: walking further up
    // would grade a line that is not last.
    return { line: lines[i].trim(), literal: end < 0 ? null : quoted.slice(1, end) };
  }
  return null;
}

/**
 * The text a literal WOULD print, with its holes punched: `${…}` regions are skipped on balanced braces (an
 * interpolation containing a ternary with its own template is still one hole), backslash escapes are resolved
 * so a typed `\n` splits the line the way the runner splits it, and a doubled backslash counts once. What is
 * left is the part of the sentence the row typed itself — the only part this gate can measure.
 */
function staticText(lit) {
  let out = '';
  for (let k = 0; k < lit.length; k++) {
    if (lit[k] === '\\' && k + 1 < lit.length) {
      const nx = lit[k + 1];
      if (nx === 'n') { out += '\n'; k++; }
      else if (nx === 'r') { out += '\r'; k++; }
      else if (nx === 't') { out += '\t'; k++; }
      else if (nx === '\\') { out += '\\'; k++; }
      else out += lit[k];
      continue;
    }
    if (lit[k] === '$' && lit[k + 1] === '{') {
      let depth = 1;
      k += 2;
      while (k < lit.length && depth > 0) {
        if (lit[k] === '{') depth++;
        else if (lit[k] === '}') depth--;
        k++;
      }
      k--;
      continue;
    }
    out += lit[k];
  }
  return out;
}

const tails = new Map();
for (const row of running) {
  const path = join(ROOT, row.file);
  if (existsSync(path)) { const t = lastPrintCall(path); if (t) tails.set(row.name, t); }
}
const noCall = running.length - tails.size;

{
  const HOUSEKEEPING = /^\[(cleanup|teardown|finally|housekeeping)\]/i;
  const offenders = [];
  let literal = 0;
  let unreadable = 0;
  for (const [name, last] of tails) {
    if (last.literal === null) { unreadable++; continue; }
    literal++;
    const head = last.literal.slice(0, 64).replace(/^(\s|\\[nrt])+/, '');
    if (HOUSEKEEPING.test(head)) offenders.push(`${name} (${running.find((r) => r.name === name).file}) :: ${last.line.slice(0, 90)}`);
  }
  assert.deepEqual(offenders, [], `${offenders.length} running row(s) end their SOURCE on a housekeeping print, so the gutter a green row leaves in the hosted log describes deleting a temp directory instead of what the row graded: ${offenders.join(' | ')} — move that print ABOVE the row's own last sentence`);
  console.log(`[§12] ${literal} of ${running.length} running rows end their source on a literal print, none of them a cleanup/teardown/finally/housekeeping tail · ${unreadable} row(s) end on a call whose argument is not an opening literal, where the source cannot say what prints last and only the hosted gutter can · ${noCall} row(s) print no console.log at all`);
}

// ── §13 a green row's LAST line must fit the gutter it is printed into ───────────────────────────
// Run 41433663171 (v568, sha e97cc05) printed 107 OK lines and 107 gutters, and ELEVEN of those gutters were
// exactly 300 bytes long: severed mid-sentence, with no mark saying a sentence had been severed. Four of them
// were rows v568 had just reordered — moving the cleanup print above the summary made the summary the gutter,
// and a long summary is a long sentence. Nine of the eleven were worse than that: their last printed line
// carries more than 300 bytes of STATIC text, before a single interpolated number, so no run of that row can
// ever print a whole gutter. v591 gave the runner a marker so a cut is visible in the log; this clause refuses
// the shape that guarantees one, because a row whose self-description is always truncated has been asked to
// say something it can never say.
// The door ASKS THE PRODUCER. `lastLineOf` and `GUTTER_BOUND_BYTES` are imported, not restated: the clip that
// decides the outcome is the same function that grades it, so a bound changed in the runner moves this clause
// on the same bytes instead of leaving a gate that quotes an old number.
// The refusal covers the guaranteed half only, and says so: interpolated text is invisible here, and two of the
// eleven hosted cuts (`verify:drive-axis`, `verify:provenance`) are exactly that kind — long sentences whose
// length depends on the numbers they carry. Those rows are not offenders; they are what the marker is for.
{
  const offenders = [];
  let measured = 0;
  let unreadable = 0;
  let atTheBound = 0;
  let closest = { name: '', bytes: 0 };
  for (const [name, last] of tails) {
    if (last.literal === null) { unreadable++; continue; }
    measured++;
    const printed = staticText(last.literal).split('\n').map((l) => l.trim()).filter(Boolean).pop() || '';
    const clipped = producer.lastLineOf(printed);
    if (clipped !== printed) {
      offenders.push(`${name} (${running.find((r) => r.name === name).file}) :: its last line holds ${Buffer.byteLength(printed)} bytes of text the row typed against a ${producer.GUTTER_BOUND_BYTES}-byte bound, so EVERY run of it ends mid-sentence`);
    } else {
      const bytes = Buffer.byteLength(printed);
      if (bytes === producer.GUTTER_BOUND_BYTES) atTheBound++;
      if (bytes > closest.bytes) closest = { name, bytes };
    }
  }
  assert.deepEqual(offenders, [], `${offenders.length} running row(s) end their source on a print too long for the gutter it lands in, so the one sentence the hosted log keeps for them is always cut: ${offenders.join(' | ')} — print a final line that fits the bound, and the long sentence above it stays available in a red tail`);
  console.log(`[§13] ${measured} row(s) measured against the runner's own ${producer.GUTTER_BOUND_BYTES}-byte clip, 0 guaranteed to be cut · ${atTheBound} land exactly on the bound and print whole · the longest whole one is ${closest.name} at ${closest.bytes} bytes · ${unreadable} row(s) end on a call this gate cannot read`);
}


// ── §14 every tsc surface the tree declares is reached by a step of SOME workflow ──────────────────
// Why a second workflow needs a clause of its own: `.github/workflows/main-line.yml` was added by cf1537e on
// 2026-11-09 — 48 commits back from the ref this clause lands on — and until this clause the string `main-line`
// appeared in NO file under tools/ or docs/evidence/ (`git grep -l main-line HEAD -- tools docs/evidence` answers
// nothing), so the thirteen clauses that gate then had read ci.yml only. The silence was not harmless: the
// sentence amendment 572 shipped about exactly this reach was false, and only reading this file plus a hosted log
// settled it (see that amendment's addendum — `git log -S"typecheck:main" -- .github/workflows/ci.yml` answers
// nothing, and the main-line job of hosted run 42665488782 printed exactly one error,
// `evals/suites/demo-mode.mts(3,26): error TS2724`). Eight of the tree's typecheck surfaces, `tsconfig.tools`
// among them, are reached by nothing but one step of that workflow, so a step deleted from it reddens no build
// and hides no error — it just stops the grading.
// What is counted is a REACH, not a name. A LEG is `tsc -p <config>` inside a script of the root manifest or of
// a manifest a root `workspaces` glob names, or a bare `tsc --noEmit`, which reads its own directory; a leg is
// REACHED when a step's `run:` in a workflow file names, transitively through `npm run` and `turbo run`, the
// script that declares it. Two refusals follow, and the second exists so the first cannot be satisfied by
// deleting the thing it counts: an ORPHAN leg (a config some script typechecks that no workflow reaches) and an
// UNTYPED surface (a tsconfig inside a package directory that no leg names anywhere — unless another config
// EXTENDS it, because a base is not a surface; seven of the tree's tsconfig files are named that way, the root
// `tsconfig.base.json` and the six package `tsconfig.json` files their `tsconfig.test.json` sibling extends).
// The census reads STEP BODIES, not files. `main-line.yml` names `npm run typecheck:main` twice in its own
// header comment, and the first version of this clause scanned whole files for `npm run`: its arm deleted the
// step and the gate stayed green, because the prose still said the words.
{
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  const TSC_P = /\btsc\b[^&|\n]*?-p\s+(\S+\.json)/g;
  const TSC_P_ONCE = new RegExp(TSC_P.source);
  const TSC_BARE = /\btsc\b[^&|\n]*?--noEmit/;
  const RUN = /npm\s+run\s+([A-Za-z0-9:_-]+)/g;
  const TURBO = /turbo\s+run\s+([A-Za-z0-9:_-]+)/g;
  const one = (xs) => [...new Set(xs)];
  const cfgKey = (dir, name) => posix.normalize(posix.join(dir === '.' ? '' : dir, name.replace(/^\.\//, '')));

  const WF_DIR = '.github/workflows';
  const wfNames = existsSync(join(ROOT, WF_DIR))
    ? readdirSync(join(ROOT, WF_DIR)).filter((f) => /\.(yml|yaml)$/.test(f)).sort() : [];
  assert.ok(wfNames.length >= 1, `no workflow file under ${WF_DIR}, so nothing in this repository can say what CI runs and every reach claim below would be vacuous`);
  const pkgDirs = one(['.', ...(JSON.parse(read('package.json')).workspaces ?? []).flatMap((glob) => {
    const parent = glob.replace(/\/\*.*$/, '');
    const at = join(ROOT, parent === '' ? '.' : parent);
    return existsSync(at) ? readdirSync(at, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => posix.join(parent, e.name)) : [];
  })]).sort();
  const manifests = pkgDirs.filter((d) => existsSync(join(ROOT, d, 'package.json')));

  const scripts = new Map();
  const legs = new Map();
  const addLeg = (cfg, site) => { if (!legs.has(cfg)) legs.set(cfg, new Set()); legs.get(cfg).add(site); };
  for (const dir of manifests) {
    const mf = dir === '.' ? 'package.json' : posix.join(dir, 'package.json');
    for (const [name, body] of Object.entries(JSON.parse(read(mf)).scripts ?? {})) {
      const key = `${mf}#${name}`;
      scripts.set(key, String(body));
      for (const m of String(body).matchAll(TSC_P)) addLeg(cfgKey(dir, m[1]), key);
      if (TSC_BARE.test(String(body)) && !TSC_P_ONCE.test(String(body))) addLeg(cfgKey(dir, 'tsconfig.json'), key);
    }
  }
  const reachedBy = new Map();
  const touch = (key, rel) => { if (!reachedBy.has(key)) reachedBy.set(key, new Set()); reachedBy.get(key).add(rel); };
  for (const wf of wfNames) {
    const rel = `${WF_DIR}/${wf}`;
    const seeds = new Set();
    for (const st of stepsOf(read(rel), rel)) for (const m of String(st.run ?? '').matchAll(RUN)) seeds.add(`package.json#${m[1]}`);
    const visit = (key) => {
      if (!scripts.has(key) || (reachedBy.get(key)?.has(rel) ?? false)) return;
      touch(key, rel);
      for (const m of scripts.get(key).matchAll(RUN)) visit(`${key.split('#')[0]}#${m[1]}`);
      for (const m of scripts.get(key).matchAll(TURBO)) for (const k of scripts.keys()) if (k.endsWith(`#${m[1]}`)) visit(k);
    };
    for (const s of seeds) visit(s);
  }
  const wfOf = (cfg) => [...new Set([...(legs.get(cfg) ?? [])].flatMap((k) => [...(reachedBy.get(k) ?? [])]))];
  const orphans = [...legs.keys()].filter((cfg) => wfOf(cfg).length === 0).sort();
  assert.deepEqual(orphans, [], `${orphans.length} typecheck leg(s) are declared in a script no workflow step reaches, so nothing in CI runs tsc over those bytes: ${orphans.map((c) => `${c} (declared by ${[...legs.get(c)].join(', ')})`).join(' | ')} — re-arm the step, or retire the leg with the config, but do not leave a surface that looks typechecked while nothing grades it`);

  const inPackages = one(pkgDirs.flatMap((d) => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)) : [])
    .filter((f) => /^tsconfig.*\.json$/.test(f)).map((f) => cfgKey(d, f)))).sort();
  const bases = new Set();
  for (const cfg of inPackages) {
    const m = /"extends"\s*:\s*"([^"]+)"/.exec(read(cfg));
    if (m) bases.add(cfgKey(posix.dirname(cfg), m[1]));
  }
  const untyped = inPackages.filter((cfg) => !legs.has(cfg) && !bases.has(cfg)).sort();
  assert.deepEqual(untyped, [], `${untyped.length} tsconfig file(s) sit in a package directory, name no leg and extend nothing, so they describe a typecheck surface the build never performs: ${untyped.join(', ')} — either a script gains a \`tsc -p\` leg for it and a workflow reaches that script, or the file is a base and another config says so with \`extends\``);

  const byWf = new Map();
  for (const cfg of legs.keys()) {
    const k = wfOf(cfg).map((w) => posix.basename(w)).sort().join('+');
    byWf.set(k, (byWf.get(k) ?? 0) + 1);
  }
  console.log(`[§14] ${legs.size} config(s) carry a declared tsc leg across ${manifests.length} of the ${pkgDirs.length} directories the root \`workspaces\` globs name, and ALL of them are reached by a step of the ${wfNames.length} workflow file(s) · who reaches them: ${[...byWf].map(([k, n]) => `${n} by ${k}`).sort().join(' · ')} · ${inPackages.length} tsconfig inside the package set, ${bases.size} of them an extends-base excused from a leg · 0 orphaned leg · 0 untyped surface`);
}

console.log(`\nci wiring: trigger covers master · proof step #${proofSteps[0].index} · ${steps.length} steps swallow nothing · build precedes it · population ${population.length} closes as ${splitSet(population).running.length} + ${splitSet(population).residue.length} · build Node ${buildNodeMajor} · ceiling ${jobTimeoutMinutes} min, read-only token · no row ends its source on a cleanup print · no row's tail is guaranteed to overrun the gutter · no orphaned tsc leg`);
