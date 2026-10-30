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
// v563 (amendment 538) — A GREEN ROW SPEAKS ONE LINE. Amendment 535's bounds named the hole: a hosted green
// said only `OK Ns`, so a proof that exited 0 having graded nothing read exactly like one that asserted
// `440/440`. Under each OK line the runner now prints the row's own last non-blank STDOUT line — stdout, not
// the combined stream, because a Node warning after a summary is not the summary — bounded to 300 bytes; a red
// row's verdict is still `causeOf` alone, and a kill has no last word.
//
// v565 (amendment 540) — THE BOUND IS BYTES, NOT CODE UNITS. v563's sentence said "300 bytes" while the clip
// was `.slice(0, 300)`, which counts UTF-16 code units: a 300-unit line of four-byte characters is 1200 UTF-8
// bytes, and slicing at unit 300 can split a surrogate pair. The clip now walks code points and stops before
// the prefix would exceed 300 UTF-8 bytes, so the named bound is the real one and a character is never cut.
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
 * measurement of that file, recorded in amendment 514's section; the wiring gate's §6 refuses an exclusion
 * that states nothing, and refuses a reason whose external reach is only prose.
 *
 * v547 (ADR 0016 amendment 530) — EMPTY, and the last entry was wrong in the way this file exists to catch.
 * It said service-suite-proof needed "maven and a real PostgreSQL"; measured, its tests are pure Mockito
 * (no Spring context, no database), and the proof runs `mvn -o -B test` to exit 0 in 52.7 s on a warm
 * repository — 400 tests in 20 classes, service digest unchanged. The real prerequisites were a JDK 25 +
 * Maven, which the workflow pins, and a warm `~/.m2` for the offline flag, which the workflow buys online
 * (a warm-up step) before the proofs run. The array is kept — not deleted — because the clause is "a proof
 * the build cannot run must say what it needs", and an empty set is still a set the gates read.
 */
export const EXCLUDED = [];

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
    // v563 — the row's own last word is its STDOUT, kept separately: stderr carries Node warnings, and a
    // warning printed after a summary is not the summary (measured: remix's combined tail ended in one).
    let said = '';
    child.stdout.on('data', (b) => {
      out += b;
      said += b;
    });
    child.stderr.on('data', (b) => (out += b));
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, budgetMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ ...r, ms: Date.now() - started, code, killed, tail: out, said });
    });
  });

export const verdictOf = (s) => (s.killed ? 'TIMEOUT' : s.code === 0 ? 'OK' : 'RED');

/**
 * v563 (amendment 538) — a green row used to say only `OK 284.7s`, so a hosted log could not tell a proof that
 * asserted `440/440` from one that exited 0 having graded nothing; amendment 535's bounds named exactly that
 * hole. The LAST non-blank line of the row's STDOUT is printed under its verdict (falling back to the combined
 * tail only when stdout is silent): bounded in bytes, and only for OK — a red row's verdict is `causeOf`
 * (v550), and a kill has no last word. Measured before shipping: the naive combined-tail rule printed remix's
 * Node ExperimentalWarning, not its ALL SECTIONS PASSED summary.
 */
export function lastLineOf(tail) {
  const line = String(tail).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() || '';
  // v565 — the gutter's bound is 300 BYTES because it bounds log size, so the clip counts UTF-8 bytes and
  // walks code points; slicing UTF-16 units could cut a surrogate pair in half and overshoot the named bound.
  let out = '';
  for (const ch of line) {
    if (Buffer.byteLength(out + ch) > 300) break;
    out += ch;
  }
  return out;
}

/**
 * The sentence that names the cause, not a window onto a stack: an `AssertionError` line IS the proof's own
 * verdict, and a runner that printed only the first three stderr lines made 32 broken imports look like 32
 * proof failures (amendment 88).
 *
 * v550 (amendment 531): the message is MULTI-LINE whenever the proof lists its findings, and the line that
 * names the subject is usually NOT the first. `verify:package-counts` refused run 40920204170 with "the
 * package table drifted from the suites it describes — regenerate it with …" and the log stopped there: the
 * seven `pkg: the table says N; the suite answered M` sentences that said WHICH row drifted were the
 * assertion's own continuation lines, and the old reader cut them off by keeping only the error line. So the
 * cause is now the error line PLUS its indented continuation, stopping at the stack (`at …`), at the first
 * unindented line, or at a blank one — bounded in both lines and bytes, because a cause is a verdict and not
 * a log. The single-line answer is unchanged: an error with no continuation prints exactly as before.
 */
export function causeOf(tail) {
  const lines = String(tail).split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
  const start = lines.findIndex((l) => /^\s*(AssertionError|[\w.]*Error:)/.test(l));
  if (start < 0) return (lines.filter((l) => l.trim()).pop() || '(the child printed nothing)').slice(0, 400);
  const out = [lines[start].trim()];
  for (const raw of lines.slice(start + 1)) {
    const t = raw.trim();
    if (!t || out.length >= 24) break;
    if (!/^\s/.test(raw) || /^at\s/.test(t)) break;
    out.push(t);
  }
  return out.join('\n').slice(0, 2000);
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
    if (verdictOf(s) === 'OK') {
      const line = lastLineOf(s.said) || lastLineOf(s.tail);
      if (line) console.log(`      | ${line}`);
    }
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
