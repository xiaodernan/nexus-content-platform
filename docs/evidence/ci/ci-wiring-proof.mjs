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
// So the wiring is a subject, not a footnote. This proof reads the shipped workflow as bytes and refuses,
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
// Node the build selects, because the proofs import a type-stripper that a lower Node does not have.
//
// §8 makes this file self-reference its own admission: the script `verify:ci-wiring` must exist and point
// here, so the door that guards the wiring is itself walked by the wiring it guards.
//
// Run from the repository root:  node docs/evidence/ci/ci-wiring-proof.mjs   (or: npm run verify:ci-wiring)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = '.github/workflows/ci.yml';
const RUNNER = 'tools/ci/proof-set.mjs';

// The producer, imported — not paraphrased. Importing it does not run it: the CLI is behind a main-module guard.
const producer = await import(new URL('../../../tools/ci/proof-set.mjs', import.meta.url).href);
const { PROOF_COMMAND, EXCLUDED, derivePopulation, danglingTargets, unknownExclusions, splitSet } = producer;
assert.ok(PROOF_COMMAND instanceof RegExp && typeof derivePopulation === 'function' && Array.isArray(EXCLUDED),
  'the runner exports its own rule — a gate that had to COPY the regex would be grading a copy, not the wiring');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/**
 * The subset of YAML this repository's workflow is written in: a `steps:` sequence whose entries carry
 * `name:`, `uses:` and a `run:` that is either a single line or a `|` block scalar. Refusing a shape this
 * reader cannot parse is deliberate: silently grading half a step is how a swallow hides.
 */
function stepsOf(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s+steps:\s*$/.test(l));
  assert.ok(at >= 0, `${WORKFLOW}: no "steps:" sequence, so nothing here can say which commands the build runs`);
  const first = lines.slice(at + 1).find((l) => /^\s*-\s/.test(l));
  assert.ok(first, `${WORKFLOW}: \`steps:\` has no entries`);
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

console.log(`\nci wiring: trigger covers master · proof step #${proofSteps[0].index} · no swallowed verdict in ${steps.length} steps · build precedes it · population ${population.length} closes as ${splitSet(population).running.length} + ${splitSet(population).residue.length} · budget grammar shared with the agents sweep · build Node ${buildNodeMajor}`);
