// M2 v94 — a row may say what it asks the repository, and the runner reconciles THREE sources.
//
// Amendment 93 shipped a prediction and named its two blind shapes: `const sh = (cmd, argv) => execFile(cmd, argv)`
// puts a PARAMETER where a call-site rule looks for a program name, and a row that reaches git through this
// directory's own runner (`sw.proofCorpus`, `sw.isolatedCheckout`) spawns one frame away from the bytes being
// scanned. Three rows therefore went red on the clean-checkout plane for a cause the prediction could not name,
// and the honest reading of that is that some reaches are only knowable to the row that makes them. So a row can
// now DECLARE them — `// sweep-asks-repository: <claim>`, the same first-column, ref-owned grammar amendment 85
// established for `// sweep-budget-ms:` — and the runner prints a declaration axis BEFORE the rows and reconciles
// declaration against prediction against verdict afterwards.
//
// A declaration changes nothing about how a row is graded: it cannot skip a row, cannot grant a fallback and
// cannot soften a verdict (amendment 86's rule against a green that graded nothing). It is foreknowledge, which
// is only worth having because it can be DISAGREED WITH — which is what this row spends its time making sure of.
// Amendment 89 is the whole method here: a quotation can wear a declaration's shape, so a marker inside a string,
// inside a block comment, or after code on the same line is NOT a declaration, and the census must refuse it.
import { execFileSync } from '../lib/syncproc.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sw from './sweep.mjs';

const HERE = join(fileURLToPath(new URL('.', import.meta.url)));
const DIR = 'docs/evidence/agents';
const norm = (s) => String(s).replace(/\r\n/g, '\n');
const git = (...args) => execFileSync('git', args, { cwd: HERE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ---------------------------------------------------------------- §0 the plane, and the bytes being censused
const gitPlane = (() => {
  try {
    return git('rev-parse', '--show-toplevel').trim() ? 'GIT' : 'NO-GIT';
  } catch {
    return 'NO-GIT';
  }
})();
const population = (
  gitPlane === 'GIT'
    ? git('ls-tree', '-r', '--name-only', 'HEAD', '--', '.')
      .split('\n')
      .filter((n) => n.endsWith('.mjs'))
      .map((short) => ({ path: `${DIR}/${short}`, text: norm(git('show', `HEAD:${DIR}/${short}`)) }))
    : readdirSync(HERE).filter((n) => n.endsWith('.mjs')).map((n) => ({ path: `${DIR}/${n}`, text: norm(readFileSync(join(HERE, n), 'utf8')) }))
);
const rows = population.filter((p) => p.path.endsWith('-proof.mjs'));
console.log(`[§0] plane ${gitPlane} · ${population.length} tracked .mjs graded, of which ${rows.length} are scored rows · declarations read from ${gitPlane === 'GIT' ? "HEAD's bytes" : 'the bytes on disk, which this plane has no index to corroborate'}`);
assert.ok(rows.length >= 71, `the axis needs the whole population, not ${rows.length} rows`);
assert.ok(rows.every((r) => r.path.startsWith(`${DIR}/`)), 'the listing named files outside this directory — the pathspec is not pointing where this row assumes');
if (gitPlane === 'GIT') {
  // Every number below is produced by code in sweep.mjs, so THAT file is the byte this row demands be committed
  // — the same provenance rule amendment 93 adopted for its own census, kept here so the two rows can be run
  // against each other without one of them grading a grammar no commit owns.
  const scannerHead = norm(git('show', `HEAD:${DIR}/sweep.mjs`));
  const scannerDisk = norm(readFileSync(join(HERE, 'sweep.mjs'), 'utf8'));
  assert.equal(scannerDisk, scannerHead, `${DIR}/sweep.mjs differs from HEAD — this census would be graded by a grammar no commit owns`);
  console.log(`[§0] the grammar used below is the committed one: docs/evidence/agents/sweep.mjs matches HEAD byte-for-byte (${Buffer.byteLength(scannerHead)} B)`);
} else {
  // Amendment 92's rule: a premise this plane cannot evaluate may not be reported as satisfied. Under a sweep
  // this directory IS a materialised ref tree and the sentence below is true; under a hand copy of a worktree it
  // is a copy of uncommitted bytes, and nothing INSIDE this file can tell the two apart. So the row states what
  // it does not know and points at the line that does: the sweep's identity block names the ref it materialised.
  console.log('[§0] no index answers here, so this census grades the bytes on disk WITHOUT checking them against a commit — the sweep\'s `[identity] ref …` line is what makes those bytes a ref\'s; read this row\'s numbers without that line they are a statement about a directory');
}

// ---------------------------------------------------------------- §1 the grammar, on cases written to break it
// Each case is [source, expected number of declarations, what the case is for]. The MUST-NOT-COUNT arms are the
// point: a channel that counts a quotation is a channel that can be triggered by a document, a comment, or
// another row's test fixture — and amendment 89 already proved that shape of failure inside this directory.
const cases = [
  ['// sweep-asks-repository: git rev-parse HEAD\n', 1, 'a first-column declaration counts'],
  ['//sweep-asks-repository:git status --porcelain\n', 1, 'no spaces after the slashes is still a declaration (the budget grammar allows it)'],
  ['   // sweep-asks-repository: git rev-parse HEAD\n', 0, 'INDENTED is not first-column — the grammar is anchored, like amendment 85\'s'],
  ['const x = 1; // sweep-asks-repository: git rev-parse HEAD\n', 0, 'a marker AFTER code on the line is a margin note, not a declaration'],
  ['const s = "\n// sweep-asks-repository: git rev-parse HEAD\n";\n', 0, 'NAMED BLIND SPOT OF THE NAIVE RULE: a quoted declaration is not a declaration'],
  ['/*\n// sweep-asks-repository: git rev-parse HEAD\n*/\n', 0, 'inside a BLOCK comment, the inner line is a drawing of a comment, not one'],
  ['/* sweep-asks-repository: git rev-parse HEAD */\n', 0, 'a block comment that wears the marker is still a comment'],
  ['// sweep-asks-repository\n', 0, 'no colon, no claim'],
  ['// sweep-asks-repository: \n', 1, 'an EMPTY claim is still an attempt — the runner refuses it out loud, and this row checks that it can see it'],
  ['// sweep-asks-repository: git archive HEAD · git ls-tree -r --name-only HEAD\n', 1, 'two reaches in one line, because the payload is free text'],
  ['// sweep-budget-ms: 300000\n// sweep-asks-repository: git rev-parse HEAD\n', 1, 'the two channels do not read each other'],
  ['// sweep-asks-repository: git rev-parse HEAD\r\n', 1, 'a CRLF copy declares the same claim — the payload may not swallow the carriage return'],
  ['console.log(`git rev-parse HEAD`);\n', 0, 'a git command printed is not a git command run (amendment 89, again)'],
  ['// sweep-asks-repository: const sh = (c, a) => execFile(c, a)\n', 1, 'a claim that does not name git still counts: this channel reports what the ROW says, not what the scanner believes'],
  ['export const A = "// sweep-asks-repository: git x";\n', 0, 'a marker in a string on ONE line, code before and after'],
  ['// sweep-asks-repository: git rev-parse HEAD\n// and it also runs git status\n', 1, 'the line AFTER the marker is NOT a continuation — a payload is ONE line, so a claim that needs two must be written on one (this case exists because my first four declarations were three lines each and the census printed them cut mid-word)'],
  ['// sweep-asks-repository: git rev-parse HEAD\n// sweep-asks-repository: git status\n', 2, 'two marker lines are two claims, and the runner prints both — nothing deduplicates what a row says twice'],
  // Five shapes measured against the committed reader rather than reasoned about: each one is a place a row's
  // bytes could LOOK like a declaration without the walker entering a code-position line comment there.
  ['const t = `x ${\'// sweep-asks-repository: git rev-parse HEAD\'} y`;\n', 0, 'a marker inside a TEMPLATE INTERPOLATION does not declare: the walker re-enters ${…} for CALLS but with no sink, so a nested frame can be counted and cannot speak'],
  ['/* c */ // sweep-asks-repository: git status\n', 0, 'a block comment BEFORE the marker on the same line means the line does not start at column 0 — the grammar stays anchored, and this case is here so that is never a surprise'],
  ['/**\n * sweep-asks-repository: git rev-parse HEAD\n */\n', 0, 'a JSDoc line is inside a block comment, so the star-first column is not a marker column'],
  ['#!/usr/bin/env node\n// sweep-asks-repository: git rev-parse HEAD\n', 1, 'a shebang before the marker does not unmake it — lineStart is measured from the newline, not from byte 0'],
  ['// sweep-asks-repository: git status /* still the payload */\n', 1, 'a /* inside a LINE comment is payload text, not a block: the comment runs to end of line'],
];
const bad = [];
for (const [src, want, why] of cases) {
  const got = sw.asksRepository(src).length;
  console.log(`  ${got === want ? 'ok  ' : 'FAIL'} ${JSON.stringify(src.split('\n')[0]).slice(0, 58)} → ${got} (want ${want}) — ${why}`);
  if (got !== want) bad.push(why);
}
assert.deepEqual(bad, [], `the declaration grammar disagreed with its own cases: ${bad.join(' · ')}`);
console.log(`[§1] declaration cases exact: ${cases.length - bad.length}/${cases.length} — including ${cases.filter(([, w]) => w === 0).length} that must NOT count`);

// ---------------------------------------------------------------- §2 one tokenizer, two channels
// The reason this channel is trustworthy at all is that it is read by the SAME walker that counts calls: a
// declaration inside a string is invisible to BOTH, so the two axes cannot drift apart by grammar.
const sink = { lineComments: [] };
const sinkSrc = "// sweep-asks-repository: git rev-parse HEAD\nexecFileSync('git', ['status']);\nconst argv = ['git', 'log'];\n// a note: git push\nconst q = '// sweep-asks-repository: git commit';\n";
const sinkHits = sw.gitReaches(sinkSrc, sink);
const vias = sinkHits.map((h) => h.via).sort().join('+');
// Two reaches, from the two rules that agree this file spawns git: the program literal in a spawn-family call's
// program position, and `'git'` as the FIRST element of an array. Asserting the VIAS rather than only the count
// matters: a count of 2 is satisfiable by one rule firing twice, which would not be the pair the census adds up.
assert.deepEqual(sinkHits.map((h) => h.via).sort(), ['argv', 'program'], `the walker was shown one program literal and one git-led argv and returned ${vias || 'nothing'}`);
assert.equal(sink.lineComments.length, 2, `the walker saw ${sink.lineComments.length} line comments at code position, want 2 (the declaration and the note; the QUOTED marker is a string, not a comment)`);
assert.equal(sw.asksRepository(sinkSrc).length, 1, 'and the declaration channel saw exactly one of them speaking');
assert.ok(sink.lineComments.some((c) => /a note: git push/.test(c.body)), 'a comment that mentions git is collected as a comment and counted as nothing');
console.log(`[§2] one tokenizer, two channels: the same walk returned ${sinkHits.length} reaches (${vias}) and collected ${sink.lineComments.length} code-position comments, of which 1 declares — the quoted marker inside \`const q = …\` is invisible to both`);

// ---------------------------------------------------------------- §3 the census, and the corroboration split
const declared = rows.map((r) => [basename(r.path), sw.asksRepository(r.text).filter((p) => p.trim() !== '')]).filter(([, a]) => a.length > 0);
const emptyAttempts = rows.filter((r) => sw.asksRepository(r.text).some((p) => p.trim() === '')).map((r) => basename(r.path));
const predicted = new Set(rows.filter((r) => sw.gitReaches(r.text).length > 0).map((r) => basename(r.path)));
const corroborated = declared.filter(([n]) => predicted.has(n)).map(([n]) => n);
const uncorroborated = declared.filter(([n]) => !predicted.has(n)).map(([n]) => n);
console.log(`[§3] census of ${rows.length} scored rows: ${declared.length} declare what they ask (${declared.map(([n, a]) => `${n}: ${a[0].slice(0, 46)}`).join(' · ')})`);
console.log(`[§3] corroboration: ${corroborated.length} declared AND visible to the scanner (${corroborated.join(', ') || 'none'}) · ${uncorroborated.length} declared but INVISIBLE to it (${uncorroborated.join(', ') || 'none'}) · ${emptyAttempts.length} attempted an empty claim (${emptyAttempts.join(', ') || 'none'})`);
assert.ok(declared.length >= 1, 'v94 shipped with declarations in the population; if this is zero the channel is dead and the runner should stop printing it');
// The load-bearing claim of the whole increment: the rows that DECLARE and are NOT predicted are exactly the
// ones whose reach hides behind a wrapper or behind the runner's own helpers. If the scanner ever learns to see
// them, this assertion must move — and that is the point, not an inconvenience.
assert.ok(uncorroborated.length > 0, 'amendment 93 measured reaches a call-site scan cannot see; a census where every declaration is corroborated would mean the blind spots were papered over rather than declared');

// ---------------------------------------------------------------- §4 the checker must be able to move, in both directions
const carrier = rows.find((r) => sw.asksRepository(r.text).length === 0);
assert.ok(carrier, 'every row declares? then the census has nothing left to measure');
const spoke = sw.asksRepository(carrier.text + '\n// sweep-asks-repository: git rev-parse HEAD\n').length;
assert.equal(spoke, 1, `appending a real declaration to ${basename(carrier.path)} must make it speak (got ${spoke})`);
const quoted = sw.asksRepository(carrier.text + '\nconst NOTE = "// sweep-asks-repository: git rev-parse HEAD";\n').length;
assert.equal(quoted, 0, `a declaration QUOTED into a string must not count (got ${quoted}) — this is the exact shape amendment 89 reddened a census for`);
const silenced = declared.length ? sw.asksRepository(rows.find((r) => sw.asksRepository(r.text).length > 0).text.replace(/^\/\/ sweep-asks-repository:[^\n]*\n/m, '')).filter((p) => p.trim() !== '').length : 0;
console.log(`[§4] census moves: append a real declaration to ${basename(carrier.path)} → +1 · append the SAME line inside a string → ${quoted} (as required) · strip the first marker line from every declaring row → ${silenced} declarations survive in the row that had the most`);
const before2 = new Set(declared.map(([n]) => n));
const afterStrip = rows.filter((r) => before2.has(basename(r.path)) && sw.asksRepository(r.text.replace(/^\/\/ sweep-asks-repository:[^\n]*\n/m, '')).filter((p) => p.trim() !== '').length > 0);
assert.ok(afterStrip.length < declared.length, 'removing every first marker from every declaring row must SHRINK the census — a checker that reports the same number after its input is deleted reports nothing');

// ---------------------------------------------------------------- §5 the budget channel is now the same reader
// `rowBudget` used to run a raw regex over the whole text, which meant a `// sweep-budget-ms:` quoted inside a
// string could buy a row milliseconds. v94 routes both channels through the tokenizer. Two things have to hold:
// the population's numbers must NOT move (which is what makes this a refactor and not a quiet behaviour change),
// and the reader must return the NUMBER the payload says — not a shape that merely parses. The migration shipped
// `all[0][1]` out of a regex-era habit, and that reads the second CHARACTER of the payload: `900000` became `0`,
// every declared budget would have been refused, and `isolated-proof.mjs` would have been killed at the runner's
// 240 000 ms default for a bug in a reader. The declared arm below therefore checks the value, not the verdict.
const budgetCases = [
  ['// sweep-budget-ms: 300000\n', 300000, 'declared', 'a first-column declaration is OBEYED, at the number it names'],
  ['// sweep-budget-ms: 900000\n', 900000, 'declared', 'the ceiling is inclusive, and this is the population\'s own largest claim'],
  ['//sweep-budget-ms:600000\n', 600000, 'declared', 'no spaces anywhere after the slashes still parses (the grammar amendment 85 shipped)'],
  ['const s = "// sweep-budget-ms: 3600000";\n', sw.DEFAULT_PROOF_TIMEOUT_MS, 'default', 'QUOTED into a string it buys NOTHING — the hole this migration closes'],
  ['/*\n// sweep-budget-ms: 3600000\n*/\n', sw.DEFAULT_PROOF_TIMEOUT_MS, 'default', 'inside a block comment it buys nothing either'],
  ['   // sweep-budget-ms: 300000\n', sw.DEFAULT_PROOF_TIMEOUT_MS, 'default', 'indented is not first-column, so it is not even an attempt'],
  ['const x = 1; // sweep-budget-ms: 300000\n', sw.DEFAULT_PROOF_TIMEOUT_MS, 'default', 'after code on the line it is a margin note'],
  ['// sweep-budget-ms: 3600001\n', sw.DEFAULT_PROOF_TIMEOUT_MS, 'refused', 'above the ceiling a human has to say --timeout'],
  ['// sweep-budget-ms: 900000ms\n', sw.DEFAULT_PROOF_TIMEOUT_MS, 'refused', 'not a whole number of milliseconds'],
  ['// sweep-budget-ms: 0\n', sw.DEFAULT_PROOF_TIMEOUT_MS, 'refused', 'zero is no duration asked for'],
  ['// sweep-budget-ms: 300000\n// sweep-budget-ms: 600000\n', sw.DEFAULT_PROOF_TIMEOUT_MS, 'refused', 'a row names its budget ONCE'],
  ['// sweep-budget-ms: 300000\n// sweep-asks-repository: git rev-parse HEAD\n', 300000, 'declared', 'the two channels do not read each other, in either direction'],
];
const budgetBad = [];
for (const [src, wantMs, wantSource, why] of budgetCases) {
  const got = sw.rowBudget(src);
  if (got.budgetMs !== wantMs || got.budgetSource !== wantSource) budgetBad.push(`${why} → got ${got.budgetMs}/${got.budgetSource}, want ${wantMs}/${wantSource}`);
}
assert.deepEqual(budgetBad, [], `the migrated budget reader disagreed with the committed grammar: ${budgetBad.join(' · ')}`);
// And the census: every row whose bytes carry a first-column marker must be obeyed AT THE NUMBER WRITTEN,
// read out of the same bytes by hand. This is the check that `all[0][1]` fails and `all[0]` passes.
const budgeted = [];
for (const r of rows) {
  const line = r.text.split('\n').find((l) => l.startsWith('// sweep-budget-ms:'));
  const b = sw.rowBudget(r.text);
  if (line) {
    const written = Number(line.split(':')[1].trim());
    assert.ok(Number.isInteger(written) && written > 0, `${basename(r.path)} carries a marker this row cannot parse by hand: ${JSON.stringify(line)}`);
    assert.equal(b.budgetMs, written, `${basename(r.path)} declares ${written}ms and the reader hands the runner ${b.budgetMs}ms — the payload and the obeyed number must be the SAME number`);
    assert.equal(b.budgetSource, 'declared', `${basename(r.path)} declares ${written}ms in the first column and the reader says ${b.budgetSource}`);
    budgeted.push(`${basename(r.path)}=${written}`);
  } else assert.notEqual(b.budgetSource, 'declared', `${basename(r.path)} has NO first-column marker yet obeys a declared budget of ${b.budgetMs}ms`);
}
console.log(`[§5] budget grammar: ${budgetCases.length - budgetBad.length}/${budgetCases.length} cases exact, ${budgetCases.filter(([, , s]) => s === 'declared').length} of which must be OBEYED at a stated number · census: ${budgeted.length} rows declare milliseconds (${budgeted.join(', ')}) and every one is obeyed at the number its own bytes hold · a quoted marker buys ${sw.rowBudget('const s = "// sweep-budget-ms: 3600000";\n').budgetMs}ms, which is the runner\'s default, not a permission`);

console.log(`\n[summary] ${rows.length} scored rows · ${declared.length} declare what they ask the repository, ${corroborated.length} corroborated by the call-site scanner and ${uncorroborated.length} visible only to the row itself · ${cases.length} grammar cases held the channel to amendment 89 (a quotation cannot declare), the census moved under three mutations and the budget channel was migrated to the same tokenizer without moving a number · a declaration buys the runner foreknowledge and buys the row nothing: it still runs, and the plane it runs on still answers`);
