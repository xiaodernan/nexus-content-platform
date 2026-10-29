// NEXUS v549 — THE PACKAGE TABLE IN THIS DIRECTORY'S README IS A CLAIM, AND A CLAIM NOBODY RE-COMPUTES IS
// DECORATIVE (the same rule the agents lane made a row in v91, one directory over).
//
// The table states how many vitest cases each of the seven workspace packages owns. Its numbers were
// hand-typed, and by v548 the drift was large enough to be a lie: the `@nexus/studio` row claimed
// 369/369 over 29 files while the suite it describes was 2840/2840 over 142, and three package rows
// were older still. The surrounding prose says "counts are authoritative" — a sentence that teaches a
// reader to trust figures no command produces.
//
// So the table is now GENERATED. This script boots every package's suite with the invocation the README
// already names (`vitest run --root <pkg> --no-file-parallelism`), reads the counts out of vitest's own
// JSON report, renders the block between the two markers, and either rewrites it (`--write`) or refuses
// a block that differs from the run it just measured. A hand-typed number cannot survive a check.
//
// §0 the block and its markers exist, and the checker is witnessed on mutated copies BEFORE it grades
//    the real one — a checker that cannot be red is decoration too · §1a `--write` refuses a DIRTY package
//    tree, because a table generated from uncommitted test bytes describes a tree nobody can check out ·
//    §1 seven suites run, each green and complete, and each count is printed with the wall-clock it took ·
//    §2 the README block equals that measurement, package by package and column by column · §3 the README is
//    untouched in check mode · §4 the summary a human quotes.
//
// v550 (ADR 0016 amendment 531): this row's first hosted run (40920204170, sha 1b2a0e0) refused the block v549
// had committed, and it was right to — the block had been generated on a working tree that carried another
// lane's uncommitted cases, so the studio row claimed a count only that desktop could produce. A generated
// number is still a lie when it is generated at the wrong moment, so `--write` now measures a COMMITTED tree
// (§1a) and the block is regenerated from HEAD rather than from a dirty checkout. Check mode is unchanged: it
// grades the tree in front of it, which is what makes a local red useful before a commit.
//
// Run: node docs/evidence/studio/package-counts-proof.mjs          (grades; exits 1 on drift)
//      node docs/evidence/studio/package-counts-proof.mjs --write  (regenerates the block)
// sweep-budget-ms: 600000
// The budget is the per-arm child timeout, not a comfort number: the Studio suite alone measured ~60 s
// on 2026-10-29, and a loaded box can multiply that. Each arm is reported with its own duration, so a
// slow run is visible rather than mistaken for a hang.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from '../lib/syncproc.mjs';

const README = 'docs/evidence/studio/README.md';
const BEGIN = '<!-- package-counts:begin';
const END = '<!-- package-counts:end -->';
const WRITE = process.argv.includes('--write');
const PKGS = [
  { name: '@nexus/design-model', root: 'packages/design-model', lane: 'the canonical model: nodes, ops, validation, layout, instances' },
  { name: '@nexus/ai-providers', root: 'packages/ai-providers', lane: 'the multimodal slice: asset library, demo image + video generators, character consistency, storyboard manager' },
  { name: '@nexus/three-runtime', root: 'packages/three-runtime', lane: 'M5: scene graph, entities, cameras, lighting, save/quest/combat/NPC surface' },
  { name: '@nexus/world-engine', root: 'packages/world-engine', lane: 'M4: world/lore/character/location + relationships + tick + save/load' },
  { name: '@nexus/agent-runtime', root: 'agents/runtime', lane: 'M2–M5 doors; see `docs/evidence/agents/README.md`' },
  { name: '@nexus/exec-host', root: 'agents/exec-host', lane: 'the only `child_process` holder (ADR 0013 policy sandbox)' },
  { name: '@nexus/studio', root: 'apps/studio', lane: 'the Studio slice: canvas, surfaces, lanes, and the `/credits` page' },
];

const norm = (s) => s.replace(/\r\n/g, '\n');
const digestOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const scratch = (() => {
  const base = join(tmpdir().replace(/\\/g, '/'), 'nexus-v549-package-counts');
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
})();

/** The generated block: one row per package, counts and files from the RUN, prose from PKGS. */
function render(rows, day) {
  const lines = [
    '| Package | Tests | Files | The lane it grades |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${r.name}\` | **${r.passed}/${r.total}** | ${r.files} | ${r.lane} |`),
    '',
    `_Generated on ${day} by \`npm run verify:package-counts\` from seven \`vitest run --root <pkg> --no-file-parallelism\` arms — never hand-typed. A package whose counts move must regenerate this block; the gate refuses a table that differs from the suites it ran._`,
  ];
  return lines.join('\n') + '\n';
}

/** Locate the marked block. One owner for "where the table is", used by the reader and the writer. */
function locate(text) {
  const b = text.indexOf(BEGIN);
  const e = text.indexOf(END);
  assert.ok(b >= 0, `this README no longer carries the ${BEGIN} … ${END} markers the gate writes into`);
  assert.ok(e > b, `the ${END} marker must come after ${BEGIN} — found begin ${b}, end ${e}`);
  const start = text.indexOf('\n', b) + 1;
  return { start, end: e, block: text.slice(start, e) };
}

const ROW = /^\|\s*`([^`]+)`\s*\|\s*\*\*(\d+)\/(\d+)\*\*\s*\|\s*(\d+)\s*\|/gm;

/**
 * Compare a README's block against a measurement. Returns one problem sentence per difference — naming
 * the package and the column, so a red sends its reader to the right row.
 */
function compare(text, rows) {
  const { block } = locate(text);
  const seen = new Map();
  const problems = [];
  let m;
  const re = new RegExp(ROW.source, 'gm');
  while ((m = re.exec(block))) {
    const [, name, passed, total, files] = m;
    if (seen.has(name)) problems.push(`${name}: the table carries TWO rows for one package`);
    seen.set(name, { passed: Number(passed), total: Number(total), files: Number(files) });
  }
  for (const r of rows) {
    const row = seen.get(r.name);
    if (!row) { problems.push(`${r.name}: the table has NO row for this package (measured ${r.passed}/${r.total} over ${r.files} files)`); continue; }
    if (row.passed !== r.passed || row.total !== r.total) {
      problems.push(`${r.name}: the table says ${row.passed}/${row.total}; the suite answered ${r.passed}/${r.total}`);
    }
    if (row.files !== r.files) problems.push(`${r.name}: the table says ${row.files} files; the run produced ${r.files}`);
  }
  for (const name of seen.keys()) if (!rows.some((r) => r.name === name)) problems.push(`${name}: the table has a row for a package this gate never measured`);
  // Order is part of the claim — the rows are the workspace in the order the gate measures it, so a
  // reshuffled table is a hand-edit even when every number is right.
  const actualOrder = [...seen.keys()];
  const expectedOrder = rows.map((r) => r.name).filter((n) => seen.has(n));
  if (actualOrder.join(',') !== expectedOrder.join(',')) {
    problems.push(`the table's row order is ${actualOrder.join(' → ')}; the gate measures ${expectedOrder.join(' → ')}`);
  }
  return problems;
}

// ---------------------------------------------------------------- §0 the block, and a checker witnessed
const day = new Date().toISOString().slice(0, 10);
const sample = PKGS.map((p, i) => ({ name: p.name, lane: p.lane, passed: 100 + i, total: 100 + i, files: 3 + i }));
{
  const good = render(sample, day);
  const text = `# table\n${BEGIN} — generated -->
${good}${END}\n`;
  assert.deepEqual(compare(text, sample), [], 'the rendered block must be clean against the measurement it was rendered from, or every red below is noise');
  assert.deepEqual(locate(text).block, good, 'the reader must return exactly the bytes the writer wrote');
  // Four mutations of the block, each of which a hand-edit really produces. The control above is what
  // makes these reds evidence: the SAME comparator calls the real block clean.
  const muts = [
    { name: 'a count gains one case', text: text.replace('| **102/102** | 5 |', '| **103/102** | 5 |'), expect: '@nexus/three-runtime' },
    { name: 'a file count drifts', text: text.replace('| **103/103** | 6 |', '| **103/103** | 7 |'), expect: '@nexus/world-engine' },
    { name: 'a package row is deleted', text: text.replace(/^\| `@nexus\/exec-host`[^\n]*\n/m, ''), expect: '@nexus/exec-host' },
    { name: 'a row for a package nobody ran is invented', text: text.replace('| **106/106** |', '| **106/106** |').replace(END, `| \`@nexus/ghost\` | **7/7** | 1 | nowhere |\n${END}`), expect: '@nexus/ghost' },
    { name: 'every number right, rows reshuffled', text: text.replace(/^(\| \`@nexus\/design-model\`[^\n]*\n)(\| \`@nexus\/ai-providers\`[^\n]*\n)/m, '$2$1'), expect: 'row order' },
  ];
  let caught = 0;
  for (const mut of muts) {
    assert.notEqual(mut.text, text, `${mut.name}: the mutation must change the bytes, not silently no-op`);
    const bad = compare(mut.text, sample);
    const hit = bad.some((p) => p.includes(mut.expect));
    if (hit) caught += 1;
    console.log(`  ${hit ? 'caught' : 'MISSED'}  ${mut.name} → ${hit ? bad.find((p) => p.includes(mut.expect)) : 'the comparator stayed silent'}`);
    assert.ok(hit, `MUTATION SURVIVED: ${mut.name} — this checker cannot see the defect it is claimed to catch`);
  }
  console.log(`[§0] the marked block is located and read · control clean · mutations caught: ${caught}/${muts.length}`);
}

// ---------------------------------------------------------------- §1a --write measures a committed tree
if (WRITE) {
  const dirty = PKGS.flatMap((p) =>
    execFileSync('git', ['status', '--porcelain', '--', p.root], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((l) => `${p.name}: ${l.trim()}`),
  );
  assert.deepEqual(
    dirty,
    [],
    `--write measures the WORKING TREE, and ${dirty.length} uncommitted path(s) sit inside the packages it would stamp:\n  ${dirty.join('\n  ')}\nA table generated here would describe bytes nobody can check out — v549 did exactly that and the next build refused it. Commit or restore them, then run --write again.`,
  );
  console.log(`[§1a] --write on a committed measurement: all ${PKGS.length} package trees match their commits`);
}

// ---------------------------------------------------------------- §1 seven suites, seven measurements
const rows = [];
for (const pkg of PKGS) {
  const out = join(scratch, `${pkg.name.replace(/[@/]/g, '_')}.json`);
  const t0 = Date.now();
  let status = 0;
  try {
    execFileSync(
      process.execPath,
      [
        'node_modules/vitest/vitest.mjs', 'run', '--root', pkg.root,
        // Load-bearing, not preferred — the same flag and the same measured reason as the agents lane's
        // table gate: a parallel pool silently drops files on this host, and a dropped file is a missing
        // count that would be reported as a drifted row.
        '--no-file-parallelism',
        '--reporter=json', `--outputFile=${out}`,
      ],
      { encoding: 'utf8', timeout: 600_000, maxBuffer: 256 * 1024 * 1024 },
    );
  } catch (e) {
    status = typeof e.status === 'number' ? e.status : -1;
  }
  const durationMs = Date.now() - t0;
  assert.ok(existsSync(out), `${pkg.name}: vitest wrote no JSON (exit ${status} after ${durationMs}ms)`);
  const rep = JSON.parse(readFileSync(out, 'utf8'));
  const results = rep.testResults ?? [];
  const failed = [];
  for (const r of results) for (const a of r.assertionResults ?? []) if (a.status === 'failed') failed.push(`${String(r.name).replace(/\\/g, '/').split('/').pop()}: ${a.fullName ?? a.title}`);
  const passed = rep.numPassedTests ?? 0;
  const total = rep.numTotalTests ?? 0;
  // Counts of a broken suite are counts of a broken suite: a red arm is refused BY NAME rather than
  // measured into a table that would then describe a suite nobody could trust.
  assert.equal(status, 0, `${pkg.name}: vitest exited ${status} in ${durationMs}ms, so its counts are a measurement of a run that did not complete${failed.length ? `\n  ${failed.join('\n  ')}` : ''}`);
  assert.deepEqual(failed, [], `${pkg.name}: a FAILING case makes every count in the table a count of a broken suite\n  ${failed.join('\n  ')}`);
  assert.ok(total > 0, `${pkg.name}: vitest reported zero cases — an empty suite is a claim about nothing, not a green`);
  rows.push({ name: pkg.name, lane: pkg.lane, passed, total, files: results.length });
  console.log(`[§1] ${pkg.name}: ${passed}/${total} in ${results.length} files · ${durationMs}ms · exit ${status}`);
}

// ---------------------------------------------------------------- §2 the README block equals the run
const before = norm(readFileSync(README, 'utf8'));
const beforeDigest = digestOf(before);
if (WRITE) {
  const loc = locate(before);
  const next = before.slice(0, loc.start) + render(rows, day) + before.slice(loc.end);
  writeFileSync(README, next, 'utf8');
  const rewritten = norm(readFileSync(README, 'utf8'));
  assert.deepEqual(compare(rewritten, rows), [], '--write must leave a block the same comparator calls clean, or the writer and the checker disagree about the format');
  console.log(`[§2] --write rewrote the marked block · ${PKGS.length} rows · ${next.length - before.length} byte(s) added`);
} else {
  const problems = compare(before, rows);
  assert.deepEqual(problems, [], `the package table drifted from the suites it describes — regenerate it with \`node docs/evidence/studio/package-counts-proof.mjs --write\` and re-read the diff:\n  ${problems.join('\n  ')}`);
  console.log(`[§2] the README block matches all ${PKGS.length} measured arms, package by package, column by column, in order`);
}

// ---------------------------------------------------------------- §3 check mode moved nothing
if (!WRITE) {
  assert.equal(digestOf(norm(readFileSync(README, 'utf8'))), beforeDigest, 'this gate ran in CHECK mode and still rewrote the README — a checker that edits its subject cannot report drift honestly');
  console.log(`[§3] check mode is read-only: README digest ${beforeDigest} unchanged across the run`);
} else {
  console.log('[§3] write mode: the README was rewritten on purpose, and the re-read block was graded clean above');
}
rmSync(scratch, { recursive: true, force: true });

const cases = rows.reduce((a, r) => a + r.total, 0);
const files = rows.reduce((a, r) => a + r.files, 0);
assert.equal(cases, rows.reduce((a, r) => a + r.passed, 0), 'the seven arms must pass every case they collected, or the table describes a suite with failures');
console.log(`\n[summary] ${PKGS.length} packages: ${cases}/${cases} cases in ${files} files, each count read out of vitest's own JSON rather than typed · the table's numbers are now a row in the gates a human can re-run, and a stale one is refused by name`);
