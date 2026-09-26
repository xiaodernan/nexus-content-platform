// NEXUS M2 v91 (docs/evidence) — A DOC TABLE IS A CLAIM, AND A CLAIM THAT NOBODY RE-COMPUTES IS
// DECORATIVE (ADR 0016 amendment 91).
// `docs/evidence/agents/README.md` stakes a sentence: the runtime rows sum to exactly 354 over 26 files,
// the exec-host rows to exactly 275 over 8, and "a row whose number drifts from its file is a
// documentation bug". Since v63 that sentence has been re-checked by hand, by whoever remembered to. This
// proof makes it a ROW: it boots vitest for both packages, reads the per-file case counts out of the JSON,
// reads the table's own digits out of the README as HEAD owns it, and compares — file by file, then the two
// prose totals, then both directions of "a file with no row" and "a row with no file".
// WHY THE READER IS THE SUBJECT (§89's family, one level down): the first version of this rig insisted the
// digits sit INSIDE the backticks. The table writes them OUTSIDE, and writes six rows as
// `visualQa.test.ts` +contrast (3) — a continuation block for a file already on the page. That reader
// parsed 322 of 354 cases and reported TWO FALSE DRIFTS (repair 11 vs 16, visualQa 21 vs 26) on a table
// that was correct. A checker with the wrong grammar does not fail quietly: it manufactures defects in
// healthy files. So §1 tests the GRAMMAR against rows the README really contains before §3 uses it, and
// §5 mutates a COPY of the table to prove the checker can be red at all.
// §1 grammar · §2 what HEAD owns vs what the run produced · §3 row-by-row + prose totals · §4 the doc's own
// "HEAD's suite is green" precondition · §5 mutations and a control · §6 nothing in this repo moved.
// All vitest reports land under os.tmpdir. Run after `npm run build`:
//   node docs/evidence/agents/table-recount-proof.mjs
// sweep-budget-ms: 300000
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const README = 'docs/evidence/agents/README.md';
const PKGS = [
  { label: 'runtime', root: 'agents/runtime', testDir: 'agents/runtime/test', prose: 'runtime' },
  { label: 'exec-host', root: 'agents/exec-host', testDir: 'agents/exec-host/test', prose: 'exec-host' },
];

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const scratch = mkTmp('nexus-v91-table');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const headReadme = git('show', `HEAD:${README}`).replace(/\r\n/g, '\n');

// ---------------------------------------------------------------- the reader
// One row: a file in backticks, an OPTIONAL ` +label` naming an extra block of cases inside that same
// file, then the digits in parentheses OUTSIDE the backticks. No `\s*` before that parenthesis and the
// base rows vanish; no ` +label` group and the continuation rows vanish. Both shapes come from the table.
const ROW = /^\|\s*`([^`]+)`(\s*\+[^(]*)?\s*\((\d+)\)\s*\|/gm;
const PROSE = /rows sum to exactly \*\*(\d+)\*\* \((\d+) files\) and the `exec-host\/\*` rows to exactly\s*\*\*(\d+)\*\* \((\d+) files\)/;

function rowsOf(text) {
  const byFile = new Map();
  let m;
  const re = new RegExp(ROW.source, 'gm');
  while ((m = re.exec(text))) {
    const file = m[1].trim().replace(/^exec-host\//, '');
    const e = byFile.get(file) ?? { total: 0, rows: [] };
    e.total += Number(m[3]);
    e.rows.push({ label: `${m[1].trim()}${m[2] ?? ''}`.trim(), n: Number(m[3]) });
    byFile.set(file, e);
  }
  return byFile;
}

function casesOf(jsonPath) {
  const rep = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const byFile = new Map();
  const failed = [];
  for (const r of rep.testResults ?? []) {
    const name = String(r.name ?? '').replace(/\\/g, '/').split('/').pop();
    const list = r.assertionResults ?? [];
    byFile.set(name, (byFile.get(name) ?? 0) + list.length);
    for (const a of list) if (a.status === 'failed') failed.push(`${name}: ${a.fullName ?? a.title}`);
  }
  return { byFile, failed };
}

// The whole check, as ONE function, so §3 (the real table) and §5 (a mutated copy) run the same code.
function recount(readmeText, runs) {
  const prose = PROSE.exec(readmeText);
  const drift = [];
  const unrowed = [];
  const rows = new Map();
  for (const { pkg, cases, owned } of runs) {
    const claimed = rowsOf(readmeText);
    rows.set(pkg.label, claimed);
    for (const [file, n] of cases.byFile) {
      if (!owned.has(file)) continue; // a file the worktree has and no commit owns is not the table's subject
      const c = claimed.get(file);
      if (!c) unrowed.push(`${pkg.label}/${file} (${n} cases)`);
      else if (c.total !== n) drift.push(`${pkg.label}/${file}: rows ${c.rows.map((r) => r.n).join('+')} = ${c.total} vs measured ${n}`);
    }
    const orphan = [...claimed.keys()].filter((f) => !cases.byFile.has(f) && [...owned].some((o) => o === f));
    for (const f of orphan) drift.push(`${pkg.label}/${f}: a row claims cases for a file the run never produced`);
    for (const f of owned) if (!cases.byFile.has(f)) drift.push(`${pkg.label}/${f}: HEAD owns this test file and the run produced NO results for it`);
  }
  const sums = {};
  for (const { pkg, cases, owned } of runs) {
    const claimed = rows.get(pkg.label);
    const mine = [...cases.byFile].filter(([f]) => owned.has(f));
    sums[pkg.label] = {
      measured: mine.reduce((a, [, n]) => a + n, 0),
      files: mine.length,
      rows: mine.reduce((a, [f]) => a + (claimed.get(f)?.total ?? 0), 0),
      rowFiles: mine.filter(([f]) => claimed.has(f)).length,
    };
  }
  return { prose, drift, unrowed, sums, rows };
}

// ---------------------------------------------------------------- §1 the grammar
{
  const table = [
    '| `registry.test.ts` (7) | arg validation |',
    '| `visualQa.test.ts` +contrast (3) | black/white passes |',
    '| `exec-host/gitTools.test.ts` (101) | v32 (fake spawn) |',
  ].join('\n');
  const r = rowsOf(table);
  assert.equal(r.get('registry.test.ts').total, 7, 'a BASE row: digits outside the backticks');
  assert.equal(r.get('visualQa.test.ts').total, 3, 'a CONTINUATION row: `file` +label (n) adds to the same file');
  assert.equal(r.get('gitTools.test.ts').total, 101, 'the exec-host/ prefix is a path, not a different file');
  assert.equal(rowsOf('the runtime rows sum to exactly **354** (26 files)').size, 0, 'prose that merely wears the shape of a row is not one: a row starts the line with a pipe');
  // and the same shapes, read out of the REAL table: the reader must meet both, or it is not being tested.
  const real = rowsOf(headReadme);
  const cont = [...real.values()].filter((e) => e.rows.length > 1);
  assert.ok(cont.length >= 2, `the live table must still contain continuation rows for this reader to be exercised — found ${cont.length}`);
  console.log(`[§1] grammar: base / continuation / prefixed rows all parse, prose does not · the live table carries ${cont.length} continuation files (${cont.map((c) => c.rows.length).join(',')})`);
}

// ---------------------------------------------------------------- §2 the bytes being graded
const runs = [];
const foreign = [];
for (const pkg of PKGS) {
  const out = join(scratch, `${pkg.label}.json`);
  let status = 0;
  try {
    execFileSync(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'run', '--root', pkg.root, '--reporter=json', `--outputFile=${out}`],
      { encoding: 'utf8', timeoutMs: 240_000, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    // A non-zero vitest exit is DATA about which cases failed, not a reason to lose the report (§60's
    // rule for the test bridge, applied to a doc gate): the JSON is written either way.
    status = typeof e.status === 'number' ? e.status : -1;
  }
  assert.ok(existsSync(out), `vitest wrote no JSON for ${pkg.label} (exit ${status})`);
  const cases = casesOf(out);
  const owned = new Set(
    git('ls-tree', '-r', '--name-only', 'HEAD', '--', pkg.testDir).split('\n').filter((p) => p.endsWith('.test.ts')).map((p) => p.split('/').pop()),
  );
  const dirty = git('diff', '--name-only', 'HEAD', '--', pkg.testDir).split('\n').filter(Boolean);
  // The doc's sentence is about the COMMITTED state, so the files it counts must be that state's bytes.
  assert.deepEqual(dirty, [], `${pkg.label}: a MODIFIED test file would be graded as if it were HEAD's — recount against a clean tree, not a mid-edit one${dirty.length ? ` (${dirty.join(', ')})` : ''}`);
  runs.push({ pkg, cases, owned });
  const extra = [...cases.byFile.keys()].filter((f) => !owned.has(f));
  for (const f of cases.failed) if (!owned.has(f.split(':')[0])) foreign.push(`${pkg.label}/${f}`);
  console.log(`[§2] ${pkg.label}: vitest exit ${status} · HEAD owns ${owned.size} test files · the run produced ${cases.byFile.size}${extra.length ? ` (worktree-only, ungraded: ${extra.join(', ')})` : ' (none worktree-only)'}`);
}

// ---------------------------------------------------------------- §3 the claim itself
{
  const res = recount(headReadme, runs);
  assert.ok(res.prose, 'the prose sentence the table stakes must be found by the reader that grades it');
  const [rtRow, rtFiles, ehRow, ehFiles] = res.prose.slice(1, 5).map(Number);
  const s = res.sums;
  console.log(`[§3] rows vs measurement: runtime rows ${s['runtime'].rows} over ${s['runtime'].rowFiles} files · measured ${s['runtime'].measured} over ${s['runtime'].files} · exec-host rows ${s['exec-host'].rows}/${s['exec-host'].rowFiles} · measured ${s['exec-host'].measured}/${s['exec-host'].files}`);
  assert.deepEqual(res.drift, [], `the table drifted from its files:\n  ${res.drift.join('\n  ')}`);
  assert.deepEqual(res.unrowed, [], `test files HEAD owns with NO row in the table: ${res.unrowed.join(', ')}`);
  assert.equal(s['runtime'].rows, rtRow, `the prose says ${rtRow} runtime cases; the rows sum to ${s['runtime'].rows}`);
  assert.equal(s['runtime'].files, rtFiles, `the prose says ${rtFiles} runtime files; the run produced ${s['runtime'].files} owned by HEAD`);
  assert.equal(s['exec-host'].rows, ehRow, `the prose says ${ehRow} exec-host cases; the rows sum to ${s['exec-host'].rows}`);
  assert.equal(s['exec-host'].files, ehFiles, `the prose says ${ehFiles} exec-host files; the run produced ${s['exec-host'].files}`);
}

// ---------------------------------------------------------------- §4 HEAD's suite is green
for (const { pkg, cases, owned } of runs) {
  const mine = cases.failed.filter((f) => owned.has(f.split(':')[0]));
  assert.deepEqual(mine, [], `${pkg.label}: a FAILING tracked case makes every count in the table a count of a broken suite${mine.length ? `\n  ${mine.join('\n  ')}` : ''}`);
}
console.log(`[§4] failing TRACKED cases: 0${foreign.length ? ` · failing cases in files NO commit owns, named and not graded: ${foreign.length} (${foreign.map((f) => f.split(':')[0]).join(', ')})` : ' · and nothing else in the tree is red either'}`);

// ---------------------------------------------------------------- §5 can this checker be red?
{
  const mutations = [
    { name: 'a base row gains one case', text: () => headReadme.replace('| `registry.test.ts` (7) |', '| `registry.test.ts` (8) |'), expect: 'registry.test.ts' },
    { name: 'a CONTINUATION row gains one case', text: () => headReadme.replace('| `visualQa.test.ts` +contrast (3) |', '| `visualQa.test.ts` +contrast (4) |'), expect: 'visualQa.test.ts' },
    { name: 'a whole row is deleted', text: () => headReadme.replace(/^\| `workspace\.test\.ts` \(\d+\)[^\n]*\n/m, ''), expect: 'workspace.test.ts' },
    { name: 'the prose total loses one', text: () => headReadme.replace('sum to exactly **354**', 'sum to exactly **353**'), expect: 'PROSE-TOTAL' },
  ];
  const control = recount(headReadme, runs);
  assert.deepEqual(control.drift, [], 'the UNMUTATED table must be clean, or a mutation red is zero evidence');
  let caught = 0;
  for (const mut of mutations) {
    const text = mut.text();
    assert.notEqual(text, headReadme, `${mut.name}: the mutation must actually change the bytes, not silently no-op`);
    if (mut.expect === 'workspace.test.ts') assert.ok(!/^\| `workspace\.test\.ts`/m.test(text), 'the deleted row must really be gone');
    const r = recount(text, runs);
    const bad = r.drift.concat(r.unrowed).join('\n');
    const hit = mut.expect === 'PROSE-TOTAL'
      ? r.prose && Number(r.prose[1]) !== r.sums.runtime.rows
      : bad.includes(mut.expect);
    if (hit) caught += 1;
    console.log(`  ${hit ? 'caught' : 'MISSED'}  ${mut.name} → ${hit ? (mut.expect === 'PROSE-TOTAL' ? `prose ${r.prose[1]} vs rows ${r.sums.runtime.rows}` : bad.split('\n')[0].slice(0, 110)) : 'the checker stayed silent'}`);
    assert.ok(hit, `MUTATION SURVIVED: ${mut.name} — this checker cannot see the defect it is claimed to catch`);
  }
  console.log(`[§5] control clean · mutations caught: ${caught}/${mutations.length}`);
}

// ---------------------------------------------------------------- §6 nothing moved
// "This proof wrote nothing" is a claim about TRACKED bytes; an untracked file someone else is working on
// is not this proof's edit, and §2 already names those. `-uno` is the difference between those two facts.
const moved = git('status', '--porcelain', '--untracked-files=no', '--', README, 'agents/runtime/test', 'agents/exec-host/test').split('\n').filter(Boolean);
assert.deepEqual(moved, [], `this proof modified tracked repository bytes: ${moved.join(', ')}`);
try {
  rmSync(scratch, { recursive: true, force: true });
  console.log('[§6] vitest reports removed from the temp dir · README and both test dirs untouched');
} catch (e) {
  console.log(`[§6] temp dir still held (${e.code ?? e.message}) — repository bytes are nonetheless unchanged`);
}

const total = runs.reduce((a, { cases, owned }) => a + [...cases.byFile].filter(([f]) => owned.has(f)).reduce((x, [, n]) => x + n, 0), 0);
const fileCount = runs.reduce((a, { cases, owned }) => a + [...cases.byFile].filter(([f]) => owned.has(f)).length, 0);
console.log(`\n[summary] graded README bytes are HEAD's (git show) and every counted test file is HEAD's (git diff empty) · vitest over ${PKGS.length} packages: ${total} tracked cases in ${fileCount} files · every row matched its file and both prose totals matched their row sums · 4 mutations of the table were caught by the same reader that calls the real one clean · a table nobody recomputes is a table nobody can trust, and this one is now a row`);
