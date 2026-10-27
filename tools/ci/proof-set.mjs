// NEXUS v528 (tools/ci) — A RED PROOF MUST FAIL THE BUILD (ADR 0016 amendment 514).
//
// Why this exists, stated the way §60 requires: amendment 513 found two m7 proofs whose needles had been
// stale for 465 and 461 commits, and the reason a stale needle cost nothing was measured, not assumed:
// `.github/workflows/ci.yml` — the repository's only workflow — ran `typecheck`, `lint`, `test` and `build`
// and NO `verify:*` step, while `on.push.branches` named only `main`, a lineage with no merge base in
// common with the `master` this lane pushes (measured 2026-10-28: `git merge-base master origin/main` exits
// 1, and `gh run list` returns ZERO runs for the repository — the workflow had never executed once). So the
// evidence directory grew to 107 `.mjs` proofs while the build graded none of them: a proof could go red
// and the only person who would notice was whoever happened to run it.
//
// This file is the runner the build calls. Its population is DERIVED, not copied: every `verify:*` script
// in `package.json` whose whole command is `node <path under docs/evidence>`. A hand-typed list would be the
// same class of bug as the one amendment 513 fixed — a record that does not move when the thing it names
// moves — so adding `verify:whatever` to package.json puts that proof into the build with no edit here, and
// deleting the script takes it out. A proof file that a script still points at but whose bytes are gone is
// a RED, not a skip: that is exactly a door nobody opened.
//
// Proofs the build machine cannot run are EXCLUDED by name, each with the external service it needs, and
// the residue is PRINTED rather than hidden — "the build runs 12 of the evidence proofs" is a claim a reader
// can falsify, while silence about the other 95 is the hole this file exists to close.
//
// One row is not as slow as another, and amendment 85 settled what a runner may do about it: the budget is
// the ROW's, declared in its own bytes as `// sweep-budget-ms: 900000`, and a kill is a TIMEOUT, a different
// verdict from a failure. This runner does not invent a second grammar for that: it IMPORTS `rowBudget` from
// `docs/evidence/agents/sweep.mjs`, so the agents sweep and the build read the same function, and a marker
// quoted inside a string or a block comment buys nothing on either channel (amendment 94's tokenizer).
//
// Run from the repository root after `npm run build`:
//   npm run verify:proofs
//   node tools/ci/proof-set.mjs --only remix        # one row, for iteration
//   node tools/ci/proof-set.mjs --list              # print the derived set and the residue, run nothing
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sweep from '../../docs/evidence/agents/sweep.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The fallback, taken from the agents runner rather than restated here: two 240 000s that drift are one bug. */
export const DEFAULT_BUDGET_MS = sweep.DEFAULT_PROOF_TIMEOUT_MS;
export const MAX_ROW_BUDGET_MS = sweep.MAX_ROW_BUDGET_MS;

/**
 * The admission rule, structural: a `verify:*` script whose ENTIRE command is one `node` call into the
 * evidence tree. Quoted whole by `docs/evidence/ci/ci-wiring-proof.mjs` §6 rather than retyped there, so the
 * day the rule and the gate disagree is a red and not a quiet divergence.
 */
export const PROOF_COMMAND = /^node +(docs\/evidence\/\S+\.mjs)$/;

/**
 * Proofs the build machine cannot run, each naming the service it needs. Every reason below is a
 * measurement of that file, recorded in amendment 514's section; §3 refuses an exclusion that states nothing.
 */
export const EXCLUDED = [
  {
    file: 'docs/evidence/m7/publish-proof.mjs',
    needs: 'the live stack — it publishes through tools/harness/studio-publish.mjs against a service that answers',
  },
  {
    file: 'docs/evidence/m7/leak-sweep-proof.mjs',
    needs: 'a docker daemon that can pull and run pgvector/pgvector:pg16 — its §5 is a real container, not a stub',
  },
  {
    file: 'docs/evidence/m7/service-suite-proof.mjs',
    needs: 'maven and a real PostgreSQL — it grades the surefire XML written by `mvn -B test` on services/nexus-api',
  },
];

export const readPkg = (root = ROOT) => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** §1 the derived population: script name + proof file, for every wired evidence proof. */
export function derivePopulation(scripts) {
  return Object.entries(scripts)
    .filter(([name, cmd]) => name.startsWith('verify:') && PROOF_COMMAND.test(String(cmd).trim()))
    .map(([name, cmd]) => ({ name, file: String(cmd).trim().match(PROOF_COMMAND)[1] }));
}

/** A script that names a proof file no longer on disk is a dangling door, and it is RED, not skipped. */
export function danglingTargets(population, root = ROOT) {
  return population.filter((d) => !existsSync(join(root, d.file))).map((d) => `${d.name} -> ${d.file}`);
}

/** An exclusion may only retire a proof that IS in the population — otherwise the record is stale. */
export function unknownExclusions(population, excluded = EXCLUDED) {
  return excluded.map((e) => e.file).filter((f) => !population.some((d) => d.file === f));
}

export function splitSet(population, excluded = EXCLUDED) {
  const files = new Set(excluded.map((e) => e.file));
  return { running: population.filter((d) => !files.has(d.file)), residue: population.filter((d) => files.has(d.file)) };
}

/**
 * The prerequisite, derived the same way: a proof that resolves a built `dist` grades the BUILD, so the
 * runner names which dist is missing before it dares call the proof red. Conflating "no bytes" with "a
 * failed assertion" is amendment 78's green-that-graded-nothing wearing the opposite colour.
 */
export function distNeeded(file, root = ROOT) {
  const src = readFileSync(join(root, file), 'utf8');
  return [...new Set([...src.matchAll(/['"]\.\/((?:packages|agents)\/[^'"]*?\/dist)/g)].map((m) => m[1]))];
}

export function missingPrerequisites(running, root = ROOT) {
  const missing = [];
  for (const r of running) for (const d of distNeeded(r.file, root)) if (!existsSync(join(root, d))) missing.push(`${r.name} needs ${d}`);
  return missing;
}

/**
 * The row's own budget, read through the agents runner's function. A refusal is DATA: the row keeps the
 * fallback and the note is printed, because a runner that obeyed a malformed marker silently would be a
 * proof buying time by writing a sentence (amendment 94 refused exactly that).
 */
export function rowBudgetOf(file, fallback = DEFAULT_BUDGET_MS, root = ROOT) {
  const read = sweep.rowBudget(readFileSync(join(root, file), 'utf8'), fallback);
  return { ms: read.budgetMs, from: read.budgetSource, note: read.note };
}

const runOne = (r, budgetMs) =>
  new Promise((done) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(ROOT, r.file)], { cwd: ROOT, windowsHide: true });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (out += b));
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, budgetMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ ...r, ms: Date.now() - started, code, killed, tail: out });
    });
  });

export const verdictOf = (s) => (s.killed ? 'TIMEOUT' : s.code === 0 ? 'OK' : 'RED');

/**
 * The sentence that names the cause, not a window onto a stack: an `AssertionError` line IS the proof's own
 * verdict, and a runner that printed only the first three stderr lines made 32 broken imports look like 32
 * proof failures (amendment 88).
 */
export function causeOf(tail) {
  const lines = String(tail).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const named = lines.find((l) => /^AssertionError/.test(l)) || lines.find((l) => /Error:/.test(l));
  return (named || lines[lines.length - 1] || '(the child printed nothing)').slice(0, 400);
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const listOnly = argv.includes('--list');
  // A flag whose value is missing is REFUSED rather than defaulted: `--budget` at the end of an argv is a
  // person who thinks they asked for something, and a runner that silently ran the other budget invented a
  // measurement nobody requested (the same reason `--only` with a typo must say NOTHING RAN).
  const budgetArg = argv.includes('--budget') ? argv[argv.indexOf('--budget') + 1] : null;
  assert.ok(budgetArg !== '' && budgetArg !== undefined, `--budget was given without a number (got ${JSON.stringify(budgetArg)})`);
  assert.ok(budgetArg === null || (Number.isInteger(Number(budgetArg)) && Number(budgetArg) > 0), `--budget asked for ${JSON.stringify(budgetArg)} — a budget is a whole number of milliseconds`);
  const budgetMs = budgetArg === null ? DEFAULT_BUDGET_MS : Number(budgetArg);

  const population = derivePopulation(readPkg().scripts);
  assert.ok(population.length >= 8, `the derived population is ${population.length} — a rule that admits almost nothing is a door, not a census`);
  assert.deepEqual(danglingTargets(population), [], 'a verify:* script points at a proof file that is not on disk');
  assert.deepEqual(unknownExclusions(population), [], 'EXCLUDED names a file that is not in the derived population — an exclusion for a proof nobody wires is a stale record');
  for (const e of EXCLUDED) assert.ok((e.needs || '').length >= 20, `${e.file} is excluded without naming what it needs (reason ${JSON.stringify(e.needs)})`);

  const { running, residue } = splitSet(population);
  const reasonOf = (f) => EXCLUDED.find((e) => e.file === f).needs;
  const budgets = running.map((r) => ({ ...r, budget: rowBudgetOf(r.file, budgetMs) }));
  if (listOnly) {
    console.log(`derived population ${population.length} = runs ${running.length} + excluded ${residue.length}`);
    for (const r of budgets) console.log(`  RUN      ${r.name.padEnd(22)} ${r.file} (budget ${r.budget.ms}ms ${r.budget.from})`);
    for (const r of residue) console.log(`  EXCLUDED ${r.name.padEnd(22)} ${r.file} — ${reasonOf(r.file)}`);
    return;
  }

  assert.deepEqual(missingPrerequisites(running), [], 'the build these proofs grade is not there — run `npm run build` first');

  const rows = [];
  console.log(`running ${running.length} derived proofs (fallback budget ${budgetMs}ms), in package.json order:`);
  for (const r of budgets) {
    if (only && !r.name.includes(only) && !r.file.includes(only)) continue;
    process.stdout.write(`  ${r.name.padEnd(22)} ${r.file} [${r.budget.from} ${r.budget.ms}ms] ... `);
    const s = await runOne(r, r.budget.ms);
    console.log(`${verdictOf(s)} ${(s.ms / 1000).toFixed(1)}s`);
    rows.push(s);
  }

  const red = rows.filter((s) => verdictOf(s) !== 'OK');
  for (const s of rows.filter((x) => verdictOf(x) !== 'OK')) console.log(`\n── ${s.name} ${verdictOf(s)} ──\n${causeOf(s.tail)}`);
  for (const r of budgets.filter((x) => x.budget.note)) console.log(`  BUDGET REFUSED ${r.name}: ${r.budget.note}`);
  for (const r of residue) console.log(`  EXCLUDED  ${r.name.padEnd(22)} ${r.file} — ${reasonOf(r.file)}`);
  console.log(`\n${rows.length - red.length}/${rows.length} green of a derived population of ${population.length} · residue named: ${residue.length}`);
  if (rows.length === 0) console.log('NOTHING RAN — a set selected down to zero rows certifies nothing (--only typo?)');
  process.exitCode = red.length > 0 || rows.length === 0 ? 1 : 0;
}

// Imported by `docs/evidence/ci/ci-wiring-proof.mjs` to read the RULE, so a gate that retyped the regex
// could go green while the runner disagreed — the two must be the same object.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
