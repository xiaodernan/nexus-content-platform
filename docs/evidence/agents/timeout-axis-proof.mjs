// NEXUS M2 v85 (docs/evidence) — a sweep row's budget is the ROW's, and a kill is a different finding from a failure.
// Run after `npm run build`:  node docs/evidence/agents/timeout-axis-proof.mjs
//
// v84 measured a clean-room build at 338 s — and 513–522 s under load — for a proof that lives in the
// population this runner grades. `runSweep` gave EVERY row the same `timeoutMs` (default 240 000) and
// printed a kill as `FAIL …, TIMEOUT`, so since v81 admitted that proof the sweep has carried a row that
// CANNOT be answered: the runner stopped asking before the proof finished, and the red it wrote was a fact
// about a constant in another file. v83's and v84's witnesses schedule themselves AGAINST that constant
// (`totalMs < DEFAULT_PROOF_TIMEOUT_MS`); nobody asked whether the constant fits the rows.
//
// Two changes, and §3 grades them in BOTH directions so a declaration is neither a floor nor a ceiling:
//   * a row may name the milliseconds it needs, in its own source, and the runner obeys that number upward
//     AND downward — the budget belongs to the row, it is not a courtesy from the runner;
//   * a killed row says WHOSE number ended it, in the record and not only in a string, because "the proof
//     answered no" and "the runner stopped asking" are two findings (v73's rule, turned on the runner).
import assert from 'node:assert/strict';
// M2 v90: amendment 86 migrated the population to the async-backed `syncproc` bridge because every
// synchronous child-process API on this host fails with EBUSY, but it MISSED this file. Both of the
// calls below therefore threw before they could read a byte, so this witness — and amendment 89's
// addendum claim that it was "verified green end to end" — were not reproducible. One import line.
import { execFileSync, spawnSync } from '../lib/syncproc.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const startedAt = Date.now();
const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);
const D = sw.DEFAULT_PROOF_TIMEOUT_MS;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const PROOF_DIR = 'docs/evidence/agents';

// ------------------------------------------------------------------ §1 the declaration rule
console.log('§1 一行自报预算：认得的形式才认，认不得的退回默认，并把为什么说出来');
const cases = [
  { src: "console.log('nothing said');\n", ms: D, from: 'default', why: 'no declaration is not a defect — most rows are fast and say nothing' },
  { src: '// sweep-budget-ms: 900000\nconsole.log(1);\n', ms: 900_000, from: 'declared', why: 'the form this increment exists for' },
  { src: '//sweep-budget-ms:1500\nconsole.log(1);\n', ms: 1500, from: 'declared', why: 'spacing around the marker is not the contract' },
  { src: '  // sweep-budget-ms: 5000\n', ms: D, from: 'default', why: 'an INDENTED marker may be a code sample inside prose, so it is not the row speaking — and treating it as a refusal would let a doc comment be a request' },
  { src: '// sweep-budget-ms: 0\n', ms: D, from: 'refused', why: 'a zero budget kills every row that carries it, so that is not a request for time' },
  { src: '// sweep-budget-ms: -5\n', ms: D, from: 'refused', why: 'negative is not a duration' },
  { src: '// sweep-budget-ms: 90000.5\n', ms: D, from: 'refused', why: 'a fraction of a millisecond names nothing this runner can schedule' },
  { src: '// sweep-budget-ms: eight-hundred\n', ms: D, from: 'refused', why: 'not a number is not a number' },
  { src: `// sweep-budget-ms: ${sw.MAX_ROW_BUDGET_MS + 1}\n`, ms: D, from: 'refused', why: `above the ${sw.MAX_ROW_BUDGET_MS}ms a row may ask for, so a human must raise --timeout deliberately` },
  { src: '// sweep-budget-ms: 5000\n// sweep-budget-ms: 90000\n', ms: D, from: 'refused', why: 'two declarations are a contradiction, not a max() for the runner to guess at' },
];
for (const c of cases) {
  const r = sw.rowBudget(c.src);
  assert.equal(r.budgetMs, c.ms, `${c.why}: budget ${r.budgetMs}, wanted ${c.ms} (source ${r.budgetSource})`);
  assert.equal(r.budgetSource, c.from, `${c.why}: source ${r.budgetSource}, wanted ${c.from}`);
  if (c.from === 'refused') assert.ok((r.note || '').length > 10, `${c.why}: a refusal with no stated reason is v80's null dressed up as silence`);
  else assert.equal(r.note, null, `${c.why}: only a refusal speaks a reason`);
}
assert.notEqual(sw.rowBudget('// sweep-budget-ms: 0\n').budgetMs, 0, 'a row may not ask to be killed instantly');
const counts = { default: 0, declared: 0, refused: 0 };
for (const c of cases) counts[sw.rowBudget(c.src).budgetSource] += 1;
console.log(`  ${cases.length} 种文本进规则：${counts.declared} 被认、${counts.refused} 被拒并退回 ${D}ms（每种都带理由）、${counts.default} 什么都没报`);

// ------------------------------------------------------------------ §2 who declared, read from the bytes this commit is about to land
console.log('§2 谁真的报了预算：读工作区要提交的字节，并和 HEAD 对照，因为两者此刻可以不同');
const headProofs = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', PROOF_DIR], { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/).filter((p) => p.endsWith('-proof.mjs'));
// The witness reads the markers with its OWN pattern rather than calling `rowBudget` (v81's discipline: an
// independent reader is the only thing that notices when the production one drifts), and it reads the
// WORKTREE bytes because those are the bytes being committed — while still asking git what HEAD holds, so
// the difference between "the fix is in this commit" and "the fix is not yet landed" is a printed fact.
const MARKER = /^\/\/[ \t]*sweep-budget-ms:[ \t]*(\d+)[ \t]*$/gm;
const declared = headProofs
  .map((p) => {
    const text = readFileSync(join(root, p), 'utf8');
    return { name: p.split('/').pop(), path: p, values: [...text.matchAll(MARKER)].map((m) => Number(m[1])), text };
  })
  .filter((d) => d.values.length > 0);
// v89's lesson turned on this file: an independent reader may differ in IMPLEMENTATION, never in GRAMMAR.
// The worktree side below asks for a marker on ANCHORED LINE ONE of the header, while the HEAD side used to
// ask `git grep -c sweep-budget-ms`, which counts MENTIONS — and this proof mentions its own marker a dozen
// times inside its §1 fixtures. That is what kept the row red in the sweep of 1c9c7ee: not a schedule that
// half-landed, but two halves of one check asking two different questions.
const grep = spawnSync('git', ['grep', '-l', '-E', '^//[ \\t]*sweep-budget-ms:[ \\t]*[0-9]+[ \\t]*$', 'HEAD', '--', PROOF_DIR], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
assert.ok(grep.status === 0 || grep.status === 1, `git grep → ${grep.status}: ${(grep.stderr || '').slice(0, 160)}`);
const atHead = new Set(String(grep.stdout || '').split(/\r?\n/).map((l) => l.replace(/^HEAD:/, '').trim()).filter((p) => p.endsWith('-proof.mjs')));

assert.ok(atHead.size === 0 || atHead.size === declared.length, `HEAD carries the marker in ${atHead.size} proof(s) while this worktree carries it in ${declared.length} (${declared.map((d) => d.name).join(', ')} / ${[...atHead].map((p) => p.split('/').pop()).join(', ')}) — either the fix has landed for every row that needs it or for none, and a half-landed schedule is exactly the state a sweep cannot interpret`);
assert.ok(declared.length >= 1, 'no proof in the bytes being committed declares a budget at all, so this increment\'s fix is not in effect and the sweep still reddens its own slowest rows for being slow');
for (const d of declared) {
  assert.equal(d.values.length, 1, `${d.name} carries ${d.values.length} declarations — §1 refuses that, so no committed proof may sit on a budget the runner quietly ignored`);
  assert.notEqual(d.values[0], D, `${d.name} declares exactly the default — say nothing instead; a declaration that changes nothing is decoration`);
  // A number nobody can trace is a number somebody will quietly lower, so the proof must cite its source.
  assert.match(d.text.slice(0, 4000), /measured|[0-9]{2,3}(\.[0-9]+)?s\b/, `${d.name} names a budget with no measurement beside it in its own header`);
  assert.ok(d.text.indexOf('sweep-budget-ms') < d.text.indexOf('import assert'), `${d.name}'s declaration must sit in the header, where a reader sees it, not beside the code it schedules`);
}
const isoHit = declared.find((d) => d.name === 'isolated-proof.mjs');
assert.ok(isoHit, `isolated-proof.mjs declares nothing (declared: ${declared.map((d) => `${d.name}=${d.values.join('/')}`).join(', ') || 'none'}) — v84 measured its clean-room build at 338 s against a ${D / 1000} s row, so it is still the row this runner cannot answer`);
const isoMs = isoHit.values[0];
assert.ok(isoMs > D * 2, `isolated-proof.mjs declares ${isoMs}ms, under 2x the default — the same arm measured 513 000ms under load, so a budget sized for a quiet box fails on a busy one`);
console.log(`  ${declared.length}/${headProofs.length} 只 proof 自报预算（${declared.map((d) => `${d.name} ${d.values[0]}ms`).join(', ')}）· HEAD 目前有标记的：${atHead.size ? [...atHead].map((p) => p.split('/').pop()).join(', ') : '还没有（本次提交才落地）'} · 其余取默认 ${D}ms`);

// ------------------------------------------------------------------ §3 scheduling, end to end through the real runSweep
console.log('§3 预算真的落到那一行上：一次 runSweep、四只脚本，两个方向都量');
const row = (name, src) => ({
  name: `${PROOF_DIR}/${name}`,
  bytes: Buffer.from(src, 'utf8'),
  text: src,
  committed: sha(Buffer.from(src, 'utf8')),
  worktree: null,
  dotIngest: false,
  ownWalk: false,
  childRelative: false,
  fileRelative: false,
});
// A busy wait, not a timer: a row meant to be killed must not survive by yielding to the event loop.
const sleep = (ms, extra = '') => `${extra}const t = Date.now();\nwhile (Date.now() - t < ${ms});\nconsole.log('slept ${ms}');\n`;
// THE RUN'S DEFAULT IS A FIXTURE TOO. The first version of this section used 2 000ms and the row that was
// supposed to FAIL fast was instead KILLED — node had not finished starting inside the budget while this
// box was busy building a studio. That is the exact mis-attribution v85 exists to remove, caught by the
// increment's own witness, so the default here is 30 000ms and §3 asserts how much of it a fast red used.
// The number moved once already: with a 10 000ms default the gate below caught a fast red taking 5 879ms
// while two other sweeps and a build shared this box, i.e. the fixture had 4.1s of margin and node's own
// startup ate most of it under load. The assertion did not loosen — a red must not be one load average
// away from reading as a kill — so the fixture got room instead.
const RUN_DEFAULT_MS = 30_000;
const sweepRows = [
  // (a) names MORE than this run offers, and outruns it ⇒ the declaration is what saves it.
  row('v85-declared-long-proof.mjs', sleep(5_000, '// sweep-budget-ms: 60000\n')),
  // (b) names nothing and outruns the run's default ⇒ killed at the RUNNER's number, the finding v85 makes sayable.
  row('v85-undeclared-slow-proof.mjs', sleep(3 * RUN_DEFAULT_MS)),
  // (c) names LESS than this run offers and outruns its own number ⇒ the declaration is obeyed downward too; it is not a floor.
  row('v85-declared-short-proof.mjs', sleep(1_500, '// sweep-budget-ms: 300\n')),
  // (d) fails fast on purpose ⇒ must never be described with a kill's vocabulary.
  row('v85-red-proof.mjs', "console.log('about to exit 1');\nprocess.exit(1);\n"),
];
const out = [];
const s = await sw.runSweep({ ref: 'HEAD', only: 'v85-', cwd: root, corpus: { ref: 'HEAD', rows: sweepRows }, timeoutMs: RUN_DEFAULT_MS, log: (l) => out.push(String(l)) });
assert.equal(s.results.length, 4, `--only v85- should run the four fixture rows, ran ${s.results.length}`);
const by = Object.fromEntries(s.results.map((r) => [r.name.split('/').pop(), r]));
const a = by['v85-declared-long-proof.mjs'];
assert.equal(a.ok, true, `a row that named 60 000ms was killed by a ${RUN_DEFAULT_MS}ms default: ${a.errTail || a.tail}`);
assert.equal(a.budgetMs, 60_000, 'the record names the budget the row actually ran under');
assert.equal(a.budgetSource, 'declared', 'and who chose it');
const b = by['v85-undeclared-slow-proof.mjs'];
assert.equal(b.ok, false, 'a row that names nothing and outruns the default may not read as a pass');
assert.equal(b.timedOut, true, 'provenance-proof.mjs §4 already pins this field; v85 keeps it rather than replacing it');
assert.equal(b.verdict, 'killed', `the record must say a KILL happened (got ${JSON.stringify(b.verdict)})`);
assert.equal(b.budgetMs, RUN_DEFAULT_MS);
assert.equal(b.budgetSource, 'default', "and that the number was the runner's, because this row never spoke");
const c = by['v85-declared-short-proof.mjs'];
assert.equal(c.ok, false, 'a row that asks for 300ms and busy-waits 1 500ms is not a pass');
assert.equal(c.verdict, 'killed', 'it IS a kill — what separates it from (b) is whose number did it');
assert.equal(c.budgetSource, 'declared', 'and the record says the row chose it, which is what keeps a declaration from being a floor');
const d = by['v85-red-proof.mjs'];
assert.equal(d.verdict, 'failed', 'a nonzero exit is a failure, in a field of its own, not a bool with two meanings');
assert.equal(d.timedOut, false);
assert.equal(d.ok, false);
// The anti-flake gate, spoken as a measurement: this row is the fixture that must NOT be a kill, so the
// distance between what it took and what it was given is the margin the whole section rests on. Had the
// box been loaded enough that node's startup ate the budget, this line says so instead of §3's assertions
// silently mislabelling a red as a kill — which is what happened at 2 000ms.
assert.ok(d.ms < RUN_DEFAULT_MS / 2, `a row that exits 1 at once took ${d.ms}ms of a ${RUN_DEFAULT_MS}ms budget — the fixture has no margin left and any verdict it reports is the box's, not the runner's`);
// `ok`/`failed` keep their old meanings on purpose: a killed row still did not pass, and every committed
// witness that counts reds (cwd-axis §4's `failed.length === 1`) has to stay right.
assert.equal(s.failed.length, 3, `\`failed\` must still be every row that did not pass (got ${s.failed.length})`);
assert.equal(s.results.filter((r) => r.verdict === 'passed').length, 1, 'one row passed');

// ------------------------------------------------------------------ §4 the PRINTED sentences
console.log('§4 印出来的那几行要说清是谁的数字：读者只看得见字');
const OKFAIL = /^(OK|FAIL|KILL) /;
assert.equal(out.filter((l) => OKFAIL.test(l)).length, 4, `one line per row, got ${out.filter((l) => OKFAIL.test(l)).length}`);
const rowLine = (n) => out.find((l) => OKFAIL.test(l) && l.includes(n));
const budgetLine = out.filter((l) => l.startsWith('[identity] row budgets'));
assert.equal(budgetLine.length, 1, `the census of declarations must print exactly once (got ${budgetLine.length})`);
assert.match(budgetLine[0], /2 of 4 rows/, `the fixture has two declarations out of four; the line said: ${budgetLine[0]}`);
assert.match(budgetLine[0], new RegExp(`default of ${RUN_DEFAULT_MS}ms`), `the census must name THIS run's default, not the constant: ${budgetLine[0]}`);
const bLine = rowLine('v85-undeclared-slow');
assert.match(bLine, /^KILL /, `a killed row must read as a kill in its own line: ${bLine}`);
assert.match(bLine, new RegExp(`default budget of ${RUN_DEFAULT_MS}ms`), 'and name the number that did it');
assert.match(bLine, /named no budget/, 'and say the row never asked for that number — this red belongs to the runner');
const cLine = rowLine('v85-declared-short');
assert.match(cLine, /300ms this row named itself/, 'a row killed at the budget it chose says so');
assert.ok(!cLine.includes(`${RUN_DEFAULT_MS}ms`), `the line may not blame the run's default for a number the row picked: ${cLine}`);
const dLine = rowLine('v85-red-proof');
assert.ok(!/KILL|killed/i.test(dLine), `v73's rule turned on the runner: a failure may not borrow a kill's vocabulary — ${dLine}`);
assert.match(rowLine('v85-declared-long'), /budget 60000ms declared/, 'a row that survived because it ASKED prints what it asked, so the honouring is visible');
// The runner prints its summary as ONE `log()` call whose text begins with `\n`, so the last element of the
// line array is a two-line string, not a line. This witness reddened on exactly that on its first run: the
// sentence it was checking was there the whole time, one newline too deep.
const summary = out.at(-1).split(/\r?\n/).filter((l) => l.length).at(-1);
assert.match(summary, /^(\[summary\] )?ref [0-9a-f]{12}/, `the summary must still begin the way four committed witnesses read it: ${summary}`);
assert.match(summary, /scripts 4 · failed 3/, `and still count reds the old way: ${summary}`);
assert.match(summary, /killed 2 \(1 at the runner's default, 1 at a budget the row named\)/, `and separate WHOSE number did the killing: ${summary}`);

// ------------------------------------------------------------------ §5 this witness's own schedule
console.log('§5 见证自己也要排进表里：它跑多久，有没有资格占一行');
const totalMs = Date.now() - startedAt;
assert.ok(totalMs < D, `this witness took ${totalMs}ms against the ${D}ms a sweep row gets — v83/v84 pinned this gate for themselves and v85 must not forget it`);
console.log(`\n[summary] the budget is the row's now: ${counts.declared}/${cases.length} fixture texts recognised and ${counts.refused} refused with a reason (§1); ${declared.length}/${headProofs.length} proofs in the bytes under test declare, isolated-proof.mjs at ${isoMs}ms against a ${D}ms default (§2); ONE real runSweep over four synthetic rows honoured a declaration UP (${a.ms}ms of work kept alive by 60 000ms while the run's default was ${RUN_DEFAULT_MS}ms) and DOWN (1 500ms of work ended by the row's own 300ms), kept every red inside \`failed\`, and left a fast red ${d.ms}ms inside that default rather than mislabelling it a kill (§3); the printed lines name WHOSE number ended each killed row and never call a nonzero exit a kill (§4); this witness scheduled itself in ${totalMs}ms of the ${D}ms default and declares NOTHING, because nothing measured here needs more (§5). Bounds, stated: the durations that forced this increment — 338.5s quiet, 513.0s/522.4s under load for one clean-room build of one ref — come from v84's arms and a BUILD arm's duration is load-dependent, so the declaration is sized for a busy box rather than re-measured here; this witness runs no real build row, so it proves the plumbing on fixtures and the census on git's bytes, not a 66-row sweep's schedule; and it does not make a hung proof immortal — a row that names 3 600 000ms can still sit there for an hour, which is why the ceiling exists and why it is refused rather than clamped.`);
