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
// §0 which plane is grading (git reachable, or a clean checkout with no `.git`) · §1 grammar · §2 what the
// graded state owns vs what the run produced · §3 row-by-row + prose totals · §4 the doc's own
// "the suite is green" precondition · §5 mutations and a control · §6 nothing in this repo moved.
// All vitest reports land under os.tmpdir. Run after `npm run build`:
//   node docs/evidence/agents/table-recount-proof.mjs
// sweep-budget-ms: 300000
// The budget above is measured rather than comfortable (timeout-axis-proof §2 grades this sentence):
// 12.2 s inside a sweep row and 15.1 s standing alone, both on 2026-09-28 — two vitest arms over two
// packages, plus the mutation control. Under load the same arms took 12.2 s beside the 300 000 ms
// ceiling, so the budget is ~25x the measurement. A number without a cited measurement is a number
// somebody will quietly lower (amendment 85).
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const README = 'docs/evidence/agents/README.md';
// The corroborated arm of the v94 axis: every git call this row makes is written IN this file, in a spawn-family
// call's program position, so sweep.mjs's code-position scanner sees the reach without being told. Its declaration
// is therefore a claim the runner can check against the bytes rather than take on the row's word.
// sweep-asks-repository: git rev-parse --show-toplevel · git show HEAD:docs/evidence/agents/README.md · git ls-tree · git diff --name-only · git status --porcelain
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

// §0 THE PLANE, asked before it is assumed. This proof's v91 self ran only on the worktree plane, and the
// first clean-checkout sweep (adfa403, 70 rows, 43 red, 0 killed, 172 s) said so by dying at load:
// `Error: Command failed: git show HEAD:docs/evidence/agents/README.md`. All 43 reds turn out to be the same
// subject — 40 name a `git …` command in their cause line and the other three (exec-host, isolated,
// porcelain-path) assert against a real SHA or working tree — because a checkout has no `.git`
// (`[identity] walked tree … census NO .git — every file here is the ref's`).
// A clean checkout is not a bug in this proof; it is the plane a row is SUPPOSED to run on, because the
// bytes there are exactly what the commit owns. So the question "what are HEAD's bytes" gets two honest
// answers: ask git when git is reachable, and when it is not, read the materialised tree and SAY so —
// never quietly pretend the precondition ran (amendment 86's rule against a green that graded nothing).
const gitPlane = (() => {
  try { return git('rev-parse', '--show-toplevel').trim() ? 'GIT' : 'NO-GIT'; } catch { return 'NO-GIT'; }
})();
const norm = (s) => s.replace(/\r\n/g, '\n');
const diskReadme = norm(readFileSync(README, 'utf8'));
let headReadme = diskReadme;
if (gitPlane === 'GIT') {
  const blob = norm(git('show', `HEAD:${README}`));
  assert.equal(diskReadme, blob, 'on the GIT plane the worktree README must equal the blob the ref owns, or this proof would grade bytes no commit made');
  headReadme = blob;
}
console.log(`[§0] plane ${gitPlane} · the graded table comes from ${gitPlane === 'GIT' ? 'the HEAD blob, cross-checked equal to the worktree copy' : 'the materialised ref tree — no .git here, so these bytes ARE what the commit owns'}`);

/** Every file under a directory, relative to it, with forward slashes. */
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d).sort()) {
      const full = join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).replace(/\\/g, '/'));
    }
  };
  walk(dir);
  return out.map((p) => `${dir}/${p}`);
}

// The substitute precondition for a plane with no index: digest the bytes this proof READS, and require them
// unchanged when it finishes. A run that rewrote a test file would be caught here even with no git to ask.
const WATCH = [README, 'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md', ...PKGS.map((p) => p.testDir)];
const snapshot = () => {
  const hash = createHash('sha256');
  for (const path of WATCH) {
    if (statSync(path).isDirectory()) for (const f of listFiles(path)) hash.update(`${f}\u0000${readFileSync(f)}`);
    else hash.update(`${path}\u0000${readFileSync(path)}`);
  }
  return hash.digest('hex').slice(0, 16);
};
const before = snapshot();

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
      [
        'node_modules/vitest/vitest.mjs', 'run', '--root', pkg.root,
        // M5 v141 — `--no-file-parallelism` is LOAD-BEARING for this row, and measured rather than
        // preferred. This proof's whole job is to compare HEAD's test-file ownership against the files
        // a run actually produced, so a pool that silently drops files turns a healthy suite into a
        // FALSE "HEAD owns this file and the run produced NO results" red. Measured on this host with
        // the default pool: `agents/exec-host` reported **4 of its 8 files** (gitTools.test.ts among the
        // missing), and the same suite reports 8/8 with this flag. The cost is wall time; the
        // alternative is a gate whose reds cannot be told from the host's own noise.
        '--no-file-parallelism',
        '--reporter=json', `--outputFile=${out}`,
      ],
      { encoding: 'utf8', timeoutMs: 240_000, maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    // A non-zero vitest exit is DATA about which cases failed, not a reason to lose the report (§60's
    // rule for the test bridge, applied to a doc gate): the JSON is written either way.
    status = typeof e.status === 'number' ? e.status : -1;
  }
  assert.ok(existsSync(out), `vitest wrote no JSON for ${pkg.label} (exit ${status})`);
  const cases = casesOf(out);
  // Which test files does the graded state OWN? git answers on the GIT plane. On a checkout with no
  // repository there is no index and no HEAD to ask — but the tree there is EXACTLY the ref's files (v81's
  // premise: `git archive` carries committed bytes and nothing else), so a listing names the same set. Both
  // arms are printed; neither is silently swapped for the other.
  //
  // M2 v132: the isolated plane is now staged as a CLONE, so `gitPlane` answers GIT there and this proof
  // takes the ls-tree arm on it — the arm that was unreachable on that plane when the runner staged a bare
  // tree. The listing arm has not become dead code: it is what an ARCHIVE-staged plane (the runner's
  // declared fallback) and any unpacked tree still take, and §0 prints which plane is being graded.
  const owned = new Set(
    gitPlane === 'GIT'
      ? git('ls-tree', '-r', '--name-only', 'HEAD', '--', pkg.testDir).split('\n').filter((p) => p.endsWith('.test.ts')).map((p) => p.split('/').pop())
      : listFiles(pkg.testDir).filter((p) => p.endsWith('.test.ts')).map((p) => p.split('/').pop()),
  );
  const dirty = gitPlane === 'GIT' ? git('diff', '--name-only', 'HEAD', '--', pkg.testDir).split('\n').filter(Boolean) : null;
  // The doc's sentence is about the COMMITTED state, so the files it counts must be that state's bytes.
  if (dirty) assert.deepEqual(dirty, [], `${pkg.label}: a MODIFIED test file would be graded as if it were HEAD's — recount against a clean tree, not a mid-edit one${dirty.length ? ` (${dirty.join(', ')})` : ''}`);
  runs.push({ pkg, cases, owned });
  const extra = [...cases.byFile.keys()].filter((f) => !owned.has(f));
  for (const f of cases.failed) if (!owned.has(f.split(':')[0])) foreign.push(`${pkg.label}/${f}`);
  console.log(`[§2] ${pkg.label}: vitest exit ${status} · ${gitPlane === 'GIT' ? 'HEAD' : 'the checkout'} owns ${owned.size} test files · the run produced ${cases.byFile.size}${extra.length ? ` (unowned by the graded state, not counted: ${extra.join(', ')})` : ' (none extra)'} · dirty-tree precondition: ${dirty ? `asked, ${dirty.length} modified` : 'asked and answered: NOT ASKABLE on a checkout (no index), so the §6 before/after digest substitutes'}`);
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
    { name: 'the prose total loses one', text: () => headReadme.replace(/sum to exactly \*\*(\d+)\*\*/, (whole, n) => 'sum to exactly **' + (Number(n) - 1) + '**'), expect: 'PROSE-TOTAL' },
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
// On a clean checkout there is no index to ask, so the claim is made about the bytes this proof READS: the
// digest of the README and both test dirs, taken before vitest booted, must be the digest after it finishes.
// That is a real substitute, not a skipped check — a proof that quietly omitted its own precondition would
// report the same green as one that satisfied it (amendment 86's rule).
const moved = gitPlane === 'GIT' ? git('status', '--porcelain', '--untracked-files=no', '--', README, 'agents/runtime/test', 'agents/exec-host/test').split('\n').filter(Boolean) : null;
if (moved) assert.deepEqual(moved, [], `this proof modified tracked repository bytes: ${moved.join(', ')}`);
const after = snapshot();
assert.equal(after, before, `the graded tree changed underneath this run: digest ${before} before vitest, ${after} after — the table was recounted while its files moved`);
try {
  rmSync(scratch, { recursive: true, force: true });
  console.log(`[§6] vitest reports removed from the temp dir · ${gitPlane === 'GIT' ? 'README and both test dirs untouched (git status empty)' : 'no index here, so the before/after digest stands in'} · graded-tree digest ${before} stable across the run`);
} catch (e) {
  console.log(`[§6] temp dir still held (${e.code ?? e.message}) — repository bytes are nonetheless unchanged`);
}

// ---------------------------------------------------------------- §7 the ledger vs the records that cite it
// ADR 0016 is the only place an amendment number is GRANTED, and its own text narrates that two numbers in the
// sixties were never granted — they live only in a stale working copy. A tracked file that cites one of them
// still sends its reader to a record that does not exist, and no other gate in this directory reads the ledger
// at all. So this section enumerates the ledger's headings and the RECORD corpus (docs/evidence/** plus
// docs/ROADMAP.md; docs/decisions/ is EXCLUDED because every ADR numbers its own amendments — including those
// would manufacture a dangling defect out of a legitimate cross-ADR citation, which is §89's wrong-grammar
// lesson one level up) and refuses any explicit citation of a number the ledger never granted.
// Two grammars stay apart on purpose. `amendment N` / `am. N` is a claim about THIS ledger. A bare `vNN`, or an
// `M2 vNN` label, is a version token that prose ranges write (a doc can say "M2 v0–v14"), so version tokens
// count as RECORDS — did anything preserve the increment — but never as dangling claims. The one-sided
// direction, headings that nothing outside the ledger repeats, is read TWO ways: no mention anywhere, and no
// record TITLE. A title is POSITIONAL — a doc heading, or the comment line that OPENS a module — because a
// deeper header line is the module's abstract, and an abstract reciting a version chain is the same kind of
// prose as a README sentence about a hole. Of the holes that leaves, the NEWEST grant is refused: the cycle
// that granted it is the cycle holding the bytes to title it. Older holes are NAMED IN FULL and not refused,
// because refusing them here would mean writing records for increments this row did not perform, and a record
// invented instead of read is exactly what amendment 90's title warns about.
// And this comment cites no ungranted number in citation grammar, because the reader's own file sits inside the
// population it scans (amendment 102: the census includes the counter).
{
  const ADR = 'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md';
  // A prose chain like "(am. 4–5)" or "(am. 74–77)" names a SPAN, not a record, so a number followed by a dash
  // is a range endpoint and cannot dangle: only a POINTER citation is refused. Measured, not assumed — the
  // first draft refused two ROADMAP range endpoints and had to be told the difference by the text itself.
  const EXPLICIT = /\b(?:amendments?|am\.)\s*#?(\d{1,4})\b(?!\s*[-\u2010-\u2015])/gi;
  const RECORD = /\b(?:M\d+\s+v|v)(\d{1,3})\b/g;
  const nums = (text, re) => { const s = new Set(); for (const x of text.matchAll(new RegExp(re.source, re.flags))) s.add(Number(x[1])); return s; };
  // An addendum reuses its parent's number and GRANTS nothing. This is that rule's single source, shared by the
  // heading reader below AND the §7 renumber witness: an addendum the grant reader skips but the renumber counts
  // would make "rename the heading numbered N" see two lines and refuse its own mutation. Measured at this ref,
  // 89, 95, 97, 101, 103 and 113 each carry a grant plus an addendum — amendment 113's addendum is the one that
  // first made the newest CITED number collide, and the crash it caused (renumber rewrote 2) is why this lives here.
  const ADDENDUM_TAIL = /^\s*(—\s*)?,?\s*addendum/i;
  const headingsOf = (t) => {
    const h = new Map();
    for (const line of t.split('\n')) {
      const m = /^#{2,3} Amendment (\d+)(?![\d.])(.*)$/.exec(line);
      if (!m || ADDENDUM_TAIL.test(m[2])) continue;
      h.set(Number(m[1]), line.replace(/^#+ /, '').slice(0, 54));
    }
    return h;
  };
  const adrText = norm(readFileSync(ADR, 'utf8'));
  const corpus = listFiles('docs').filter((p) => !p.startsWith('docs/decisions/') && (p.endsWith('.md') || p.endsWith('.mjs')));
  // A .mjs TITLE is POSITIONAL: the comment line that OPENS the module, after an optional shebang. The first
  // version of this reader took "any comment line among the first 8" instead, and the witness below measures
  // what that window bought: header blocks in this population run 0 to 50 lines wide, so 8 is a choice about
  // nothing but how far the reader was willing to scroll — and a deep line of a header is the module's
  // ABSTRACT. An abstract reciting "v81 built the checkout, v82 made its verdict quotable, v83 named the
  // build" titles nothing, exactly the way a sentence about a hole is not its record.
  // What the rule is NOT: "a title names one increment". Measured here, a large minority of title lines
  // credit more than one grant, including a proof whose real opening line names three. Only POSITION
  // separates a title from the paragraph under it; the count below is the witness that says so.
  const titleAt = (p, lines, i, window) => {
    if (p.endsWith('.md')) return /^#{1,6} /.test(lines[i]);
    if (!lines[i].startsWith('//')) return false;
    return window === undefined ? i === (lines[0].startsWith('#!') ? 1 : 0) : i < window;
  };
  const census = (adrCopy, edit, window) => {
    const headings = headingsOf(adrCopy);
    const explicit = new Set(), recorded = new Set(), inDoc = new Set(), site = new Map(), recSite = new Map(), titled = new Set(), titleSites = new Map(), multiTitle = [];
    for (const p of corpus) {
      let text = norm(readFileSync(p, 'utf8'));
      // The in-memory edit reaches EVERY file in the corpus, not only the README. A hook that can touch one
      // file cannot ask whether the newest grant is titled ANYWHERE, and that is the question the refusal
      // below answers.
      if (edit) text = edit(p, text);
      const lines = text.split('\n');
      // A record TITLE is what a reader actually follows: a heading in a doc, or the line that opens a proof.
      // The same two grammars over fewer lines — that is the whole difference from the mention reader, and the
      // containment assertion below is what keeps it true.
      lines.forEach((line, i) => {
        if (!titleAt(p, lines, i, window)) return;
        const credited = [...new Set([...nums(line, EXPLICIT), ...nums(line, RECORD)])].filter((n) => headings.has(n));
        if (credited.length > 1) multiTitle.push(p + ':' + (i + 1));
        for (const n of credited) {
          titled.add(n);
          if (!titleSites.has(n)) titleSites.set(n, []);
          titleSites.get(n).push(p + ':' + (i + 1));
        }
      });
      for (const n of nums(text, EXPLICIT)) { explicit.add(n); if (!site.has(n)) site.set(n, p); if (p.endsWith('.md')) inDoc.add(n); }
      for (const n of nums(text, RECORD)) { recorded.add(n); if (!recSite.has(n)) recSite.set(n, p); }
    }
    const dangling = [...explicit].filter((n) => !headings.has(n)).sort((a, b) => a - b);
    const nowhere = [...headings.keys()].filter((n) => !explicit.has(n) && !recorded.has(n)).sort((a, b) => a - b);
    const onlyCode = [...headings.keys()].filter((n) => explicit.has(n) && !inDoc.has(n)).sort((a, b) => a - b);
    // nowhere = granted and repeated by NOTHING outside the ledger, on any line of any file.
    // hole    = granted and named by no record TITLE. Every title line is also a line, so a credit in the
    // title reader must be a credit in the mention reader: hole always contains nowhere, and the numbers in
    // the difference are the ones whose only surviving mention is prose.
    const hole = [...headings.keys()].filter((n) => !titled.has(n)).sort((a, b) => a - b);
    // What a hole number's remaining credit IS, named by the grammar that found it. The first report line
    // could only say "prose in <file>", where <file> came from the explicit-citation reader alone — so a
    // number that nobody cites but several files version-label was reported as having no citing file at all.
    // A wrong sentence about a real finding is the species this whole arc keeps meeting.
    const credit = (n) => (site.has(n)
      ? `${n} cited by ${site.get(n)}`
      : recSite.has(n)
        ? `${n} carried only by the version label in ${recSite.get(n)}`
        : `${n} carried by no file outside the ledger`);
    return { headings, explicit, recorded, dangling, nowhere, onlyCode, site, recSite, hole, titled, titleSites, multiTitle, credit, window };
  };
  // The containment is a property of the two readers, so every census this section produces is checked with
  // it — including the mutants. An assertion that is only ever run on the baseline is vacuous the day the
  // baseline is empty, and the measured baseline nowhere list IS empty.
  const checkContainment = (x, label) => assert.ok(x.nowhere.every((n) => x.hole.includes(n)), `${label}: ${x.nowhere.filter((n) => !x.hole.includes(n)).join(', ')} has no mention anywhere yet a record TITLE credits it, so the two readers no longer differ only in which lines they scan`);
  // The one hole direction THIS cycle can refuse is the newest grant: the cycle that added a heading to the
  // ledger is the cycle holding the bytes that would title it, so a refusal costs no invented record. Older
  // holes stay named and not refused — writing a record for an increment this row did not perform is the
  // invention amendment 90's title warns about, and it is the reason this section names its holes on the
  // console rather than deleting the finding.
  const newestGrant = (x) => Math.max(...x.headings.keys());
  const refusal = (x) => (x.hole.includes(newestGrant(x)) ? `unrecordedNewest:${newestGrant(x)}` : null);
  const c = census(adrText, null);
  checkContainment(c, 'the measured baseline');
  assert.deepEqual(c.dangling, [], `${c.dangling.length} tracked file(s) cite an amendment number ADR 0016 never granted, so the reader is sent to a record that does not exist:\n${c.dangling.map((n) => `  amendment ${n} cited by ${c.site.get(n)}`).join('\n')}`);
  assert.equal(refusal(c), null, `this run is refused: the newest grant ${newestGrant(c)} is named by no record TITLE in ${corpus.length} corpus files, so an amendment entered the ledger and no README section or proof header carries it. Write its record — do not delete this assertion, which is the whole point of the door.`);
  console.log(`[§7] ledger headings ${c.headings.size} · record corpus ${corpus.length} files (docs/evidence + ROADMAP; other ADRs excluded) · titles read POSITIONALLY (a doc heading, or the line that opens a module) · dangling explicit citations 0 · the newest grant ${newestGrant(c)} IS titled, which the refusal below proves is a real condition and not a free pass · one-sided read TWO ways: no mention at all ${c.nowhere.length}, no record TITLE ${c.hole.length} [${c.hole.join(', ')}] — the older holes are NAMED here and left to a cycle that can write their records honestly, and what each one has now is: ${c.hole.map((n) => c.credit(n)).join(' · ') || 'none'} · explicit citations kept only in code, never in a doc: ${c.onlyCode.join(', ') || 'none'}`);
  {
    const fresh = Math.max(...c.headings.keys()) + 700;
    const one = census(adrText, (_p, t) => t + `\nSee ADR 0016 amendment ${fresh} for the rule.\n`);
    assert.ok(one.dangling.includes(fresh), `MUTATION SURVIVED: a doc citing amendment ${fresh}, which no heading grants, is not named as dangling`);
    console.log(`  caught  a doc cites a number the ledger never granted → amendment ${fresh} named as dangling`);
    // Renumber a heading the corpus actually CITES: renaming an uncited heading orphans nothing, so the first
    // version of this mutation (the newest heading, 110) could not produce its defect however good §7 was.
    // And the rename is done with a regex LITERAL, not a string: inside a template literal '\b' is a backspace
    // and '\d' is the letter d, so a string-built regex silently matched zero lines and the mutation no-oped.
    const cited = [...c.headings.keys()].filter((n) => c.explicit.has(n));
    assert.ok(cited.length, 'no corpus file cites any amendment by number, so the dangling direction is untestable by renumbering — say so rather than report a caught mutation');
    const newest = Math.max(...cited);
    const orphan = newest + 900;
    const renumber = (text, from, to) => {
      let hits = 0;
      const out = text.split('\n').map((line) => {
        const m = line.match(/^(#{2,3} Amendment )(\d+)(?![\d.])(.*)$/);
        if (!m || Number(m[2]) !== from) return line;
        // Rename the heading that GRANTS `from`, never a co-located addendum. An addendum shares the number but
        // grants nothing, so its citations are not the ones that would dangle — and counting it here is what made
        // the witness report 'rewrote 2' for amendment 113's addendum instead of running its own mutation.
        if (ADDENDUM_TAIL.test(m[3])) return line;
        hits += 1;
        return m[1] + to + m[3];
      });
      assert.equal(hits, 1, `the mutation must rewrite exactly ONE heading that GRANTS ${from} (addenda sharing its number excluded) and rewrote ${hits} — a mutation that changes no bytes, or the wrong bytes, is not a witness`);
      return out.join('\n');
    };
    const two = census(renumber(adrText, newest, orphan), null);
    assert.ok(!two.headings.has(newest), `MUTATION SURVIVED: the renumber left heading ${newest} granted`);
    assert.ok(two.dangling.includes(newest), `MUTATION SURVIVED: renaming heading ${newest} leaves its citations pointing at nothing, and §7 did not notice`);
    assert.ok(two.nowhere.includes(orphan), `MUTATION SURVIVED the other way: the renamed heading ${orphan} has no record anywhere and is not named one-sided`);
    checkContainment(two, 'the renumbered ledger');
    assert.ok(two.hole.includes(orphan), `MUTATION SURVIVED containment: the orphan ${orphan} is unmentioned yet no title hole, so a title was credited to a file the mention reader never saw`);
    assert.deepEqual(two.nowhere.filter((n) => n !== orphan), c.nowhere, 'the one-sided list must gain ONLY the orphan this mutation created: the measured baseline already carries one entry, so an empty-list expectation is a wish about the tree, not a claim about the reader');
    // A hole is only a finding if the door can see it close, so the title arm copies the ledger's OWN
    // heading text for the first hole number. Measured at this ref: the house style is
    // "## Amendment 21 — v21: …", the em dash makes the mention grammar refuse the phrase, and the version
    // label is what credits it — so this arm tests the reader AND pins the rule a record author has to know:
    // give your README section the amendment's version label or this door will keep calling it unrecorded.
    const t4 = c.hole[0];
    assert.ok(t4 !== undefined, 'no title hole to mutate — the axis is unverifiable rather than passing');
    const houseTitle = '## ' + c.headings.get(t4) + ' (title added in memory only, never written to disk)';
    assert.ok(!nums(houseTitle, EXPLICIT).has(t4), `this arm's meaning depends on the mention grammar refusing the house-style dash after ${t4}; if that changes, this witness is testing a different door`);
    const four = census(adrText, (_p, t) => t + '\n' + houseTitle + '\n');
    assert.deepEqual(four.hole, c.hole.filter((n) => n !== t4), `adding a house-style record title for ${t4} must shrink the hole by exactly that entry, got [${four.hole.join(', ')}]`);
    assert.deepEqual(four.nowhere, c.nowhere, 'a title line must not move the any-mention reading');
    assert.deepEqual(four.dangling, c.dangling, 'a title for a granted amendment cannot create a dangling citation');
    checkContainment(four, 'a title added in memory');
    console.log(`  caught  the ledger's own house-style title for ${t4} appears in the README → the title hole shrinks by exactly one, credited through its version label while the dash-ended phrase stays refused`);
    // The same number in a SENTENCE must not close it: that is the defect this amendment exists for.
    const prose = census(adrText, (_p, t) => t + `\nSee ADR 0016 amendment ${t4} for the rule that is still unrecorded.\n`);
    assert.deepEqual(prose.hole, c.hole, `MUTATION SURVIVED: a prose sentence naming ${t4} closed the title hole — the door is satisfiable by its own report again`);
    assert.ok(prose.nowhere.length <= c.nowhere.length, 'a sentence can only ever reduce the any-mention reading, never enlarge it');
    checkContainment(prose, 'a sentence, not a record');
    console.log(`  caught  the same number in PROSE → the title hole still names ${t4}, because a sentence about a hole is not its record`);
    // And the hole must be losable for the right reason: delete the ONLY title crediting a number. The site
    // is read out of the census and its own file is opened, because with a corpus-wide edit hook there is no
    // reason to assume the sole title lives in the README.
    const sole = (n) => (c.titleSites.get(n) ?? []);
    const single = [...c.titleSites].filter(([, ss]) => ss.length === 1).sort((a, b) => a[0] - b[0]);
    assert.ok(single.length, 'no granted number has exactly one title site, so the strip arm has no single-site subject — say so rather than report a caught mutation');
    const [hNum, [hSite]] = single[0];
    const hFile = hSite.slice(0, hSite.lastIndexOf(':'));
    const hIdx = Number(hSite.slice(hFile.length + 1)) - 1;
    const hLines = norm(readFileSync(hFile, 'utf8')).split('\n');
    const hLine = hLines[hIdx];
    assert.ok(titleAt(hFile, hLines, hIdx, c.window), `the derived site ${hSite} is not a title line under the rule being tested: ${hLine.slice(0, 60)}`);
    const L = [...new Set([...nums(hLine, EXPLICIT), ...nums(hLine, RECORD)])].filter((n) => c.headings.has(n));
    for (const n of L) assert.deepEqual(sole(n), [hSite], `${n} is credited by more than this one title, so scrubbing it is not a single-site mutation`);
    const strip = census(adrText, (p, t) => {
      if (p !== hFile) return t;
      const lines = t.split('\n');
      lines[hIdx] = lines[hIdx].replace(/\d+/g, '');
      assert.notEqual(lines[hIdx], hLine, 'the scrub found no digits on the title it selected, so it changed nothing');
      assert.equal(nums(lines[hIdx], EXPLICIT).size + nums(lines[hIdx], RECORD).size, 0, `the scrubbed title still credits something: ${lines[hIdx].slice(0, 70)}`);
      return lines.join('\n');
    });
    assert.deepEqual(strip.hole, [...new Set([...c.hole, ...L])].sort((a, b) => a - b), `deleting the only title for ${L.join(', ')} must put exactly those numbers back in the hole, got [${strip.hole.join(', ')}]`);
    assert.deepEqual(strip.dangling, c.dangling, 'deleting a citation cannot create a dangling one, so a change here means the two readers are entangled');
    checkContainment(strip, 'a title with its numbers scrubbed');
    console.log(`  caught  ${hFile} line ${hIdx + 1} loses every number it was the sole title for (${L.join(', ')}) → the hole gains exactly those and dangling does not move`);
    // What the positional rule REPLACED, measured rather than asserted: re-open the title reader with the
    // window the first version used and ask which numbers that window alone titled. An empty answer means the
    // two rules agree in this tree and the arm has no subject — which is said out loud, not reported as a
    // caught mutation.
    const wide = census(adrText, null, 8);
    assert.ok(wide.hole.every((n) => c.hole.includes(n)), `widening the reader may only REMOVE holes, since an opening line sits inside every window deep enough to reach it; got ${wide.hole.filter((n) => !c.hole.includes(n)).join(', ')}`);
    const chained = c.hole.filter((n) => !wide.hole.includes(n));
    assert.ok(chained.length, "no number is titled ONLY below a module's opening line, so window-vs-positional has no subject in this tree and the rule above is unfalsified here rather than verified");
    for (const n of chained) {
      const only = (wide.titleSites.get(n) ?? []).filter((s) => !sole(n).includes(s));
      assert.ok(only.length, `${n} left the hole when the window opened, yet no title site differs — the two readers disagree about something other than position`);
      const f = only[0].slice(0, only[0].lastIndexOf(':'));
      const lno = Number(only[0].slice(f.length + 1));
      const line = norm(readFileSync(f, 'utf8')).split('\n')[lno - 1];
      const also = [...new Set([...nums(line, EXPLICIT), ...nums(line, RECORD)])].filter((m) => wide.headings.has(m) && m !== n);
      assert.ok(also.length, `the line that titled ${n} only inside the window (${f}:${lno}) names no other grant, so it IS a title and the positional rule is wrong about it: ${line.slice(0, 70)}`);
      console.log(`  caught  the window the positional rule replaced titled ${n} from ${f}:${lno}, a line naming ${also.sort((a, b) => a - b).join(', ')} beside it — a version chain, which is what an abstract is`);
    }
    // And the count that decides the RULE'S SHAPE: a title naming several grants is normal here, so the door
    // may not refuse a title for crediting two numbers, and position is the only separator left. If this ever
    // reads zero the comment above the reader has no witness and must be re-read, so it is asserted.
    assert.ok(c.multiTitle.length, 'no title line credits more than one grant in this tree, so "positional, not one-per-title" has no witness here and the rule needs a new reason');
    console.log(`  measured title lines naming MORE THAN ONE grant: ${c.multiTitle.length} under the positional rule (${wide.multiTitle.length} under the window it replaced) — the rule is about where a title sits, never how many numbers it carries`);
    // The refusal on the newest grant has to be capable of firing, and the only honest way to see that is to
    // ask a census whose newest title has been removed. If the newest grant were already untitled the assert
    // above would be red before this line, so reaching here with zero sites is stated as impossible, not skipped.
    const ng = newestGrant(c);
    const nSites = sole(ng);
    assert.ok(nSites.length, `the refusal above is already red and this arm cannot run: the newest grant ${ng} has no title site to strip`);
    const nFiles = [...new Set(nSites.map((s) => s.slice(0, s.lastIndexOf(':'))))];
    assert.ok(nFiles.every((f) => corpus.includes(f)), `the newest grant is titled outside the corpus the census reads (${nFiles.filter((f) => !corpus.includes(f)).join(', ')}), so the strip below would leave a credit reachable and the teeth test would be a fiction`);
    const noNewest = census(adrText, (p, t) => {
      if (!nFiles.includes(p)) return t;
      return t.split('\n').map((line, i) => {
        if (!nSites.includes(p + ':' + (i + 1))) return line;
        const out = line.replace(/\d+/g, '');
        assert.notEqual(out, line, `${p}:${i + 1} was chosen as a title of ${ng} and holds no digit, so this mutation would change nothing there`);
        return out;
      }).join('\n');
    });
    assert.ok(!noNewest.titled.has(ng), `MUTATION SURVIVED: every title site of the newest grant ${ng} was scrubbed and something still titles it`);
    assert.equal(refusal(noNewest), `unrecordedNewest:${ng}`, `MUTATION SURVIVED: the newest grant ${ng} has no title left and the refusal did not name it — got ${String(refusal(noNewest))}`);
    const gained = noNewest.hole.filter((n) => !c.hole.includes(n));
    assert.ok(gained.includes(ng), `the hole must gain the newest grant ${ng} when its titles are stripped, got [${gained.join(', ')}]`);
    checkContainment(noNewest, 'a ledger whose newest record title was scrubbed');
    console.log(`  caught  the newest grant's ${nSites.length} title line(s) in ${nFiles.join(', ')} lose their numbers → the refusal reads unrecordedNewest:${ng} and the hole gains ${gained.join(', ')}`);
    console.log(`  caught  the newest heading renumbered → the old number ${newest} is dangling (cited, ungranted) and the new one ${orphan} is one-sided (granted, uncited), and the one-sided list gains exactly the baseline entry and nothing else`);
  }
}

const total = runs.reduce((a, { cases, owned }) => a + [...cases.byFile].filter(([f]) => owned.has(f)).reduce((x, [, n]) => x + n, 0), 0);
const fileCount = runs.reduce((a, { cases, owned }) => a + [...cases.byFile].filter(([f]) => owned.has(f)).length, 0);
// The summary line is the one a human quotes, and on the first isolated run it said "git show" and
// "git diff empty" on a plane where neither command answers — §0 and §6 had already switched arms and this
// sentence had not. Amendment 92's axis applies to prose as loudly as to assertions: name the arm you used.
console.log(`\n[summary] plane ${gitPlane}: ${gitPlane === 'GIT' ? "graded README bytes are HEAD's (git show) and every counted test file is HEAD's (git diff empty)" : "graded README bytes are the materialised ref tree (no .git answers here) and the precondition is the §6 before/after digest, not an index"} · vitest over ${PKGS.length} packages: ${total} tracked cases in ${fileCount} files · every row matched its file and both prose totals matched their row sums · 4 mutations of the table were caught by the same reader that calls the real one clean · a table nobody recomputes is a table nobody can trust, and this one is now a row`);
