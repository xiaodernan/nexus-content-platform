// NEXUS v647 (docs/evidence/ci) — THE WHOLE TREE LINTED: areas derived from `git ls-files`, one ESLint
// child per area, and a debt ledger keyed on (rule, file) that may only fall.
//
// Why this exists. `npm run lint` is `turbo run lint`, and a package joins that run only by declaring a
// `lint` script of its own — few do, and this file prints the tally it resolves from the root workspaces
// globs rather than asking a reader to trust a sentence about it. Every tracked source file the tally
// leaves out was graded by nothing: all of `e2e/`, `docs/evidence/`, `tools/`, `evals/`, `scripts/`, the
// files at the repo root, and every package outside the tally. The root manifest did have an `eslint`
// script for the job (`eslint .`), and it died before it graded a single file — re-measured at this ref with
// the script's OWN argv (no `--config`), because a run aimed at `apps/studio`, or at `apps/studio/src` where
// no config file sits, or at the whole tree, all answer the same way in 4.5 s: exit 2, `Cannot read config
// file: apps/studio/node_modules/eslint-config-next/index.js` under `Failed to patch ESLint because the
// calling module was not recognized`, and not one line of its output names a file. So the hole was not only
// unreached, it was unrunnable, which is how a surface stays hidden: nobody can tell an empty result from a
// crash that printed nothing.
//
// Four decisions, each because the obvious alternative failed on measurement:
//
// 1. ONE CHILD PER AREA, not one process over the tree. Behind the crash there is a second death: pointed at
//    a COPY of the same config bytes with `--config` — which skips the per-directory lookup, so it survives
//    apps/studio — the whole-tree run reaches 4078 MB and dies of the heap (exit 134, 200 s in) without a
//    verdict on any file. This landing's own bytes answer differently (`apps/studio/**` ignored, the
//    non-type-checked families excluded): `eslint .` finishes in 248 s and prints 223 findings. So the
//    whole-tree process is not the shape a red turns into a repair — a child per directory keeps each program
//    bounded, and it names WHICH area refused to answer, which a whole-tree exit code cannot.
// 2. AREAS ARE DERIVED from `git ls-files`, not from a hand-kept list. A list of directories is a hiding
//    place: `e2e/` (51 tracked files) is in none of the workspaces globs, so a runner built from those
//    globs would have silently graded everything except it.
// 3. THE LEDGER IS PER (RULE, FILE) AND IT IS TIGHT, not a budget. A per-rule ceiling lets you fix a finding
//    in one file and introduce one in another and call the total flat; a ceiling you may stay UNDER lets a
//    fix rot into a licence. Identity keys (ADR 0016's own rule for exemption tables) make both reds: a new
//    (rule, file) pair is undeclared debt, a pair above its ceiling grew, and a pair BELOW its ceiling means
//    the file is better than the ledger claims and the ledger has to be re-derived. `--write` may only
//    re-derive DOWNWARD, so re-deriving is how a fall is recorded, never how a rise is laundered.
// 4. THE BASIS IS THE INDEX, not the working tree. This runs in a worktree several lanes edit at once, and
//    the first derivation measured a stranger's in-flight draft: one proof file carried 4 findings here and
//    3 in its committed bytes (its HEAD side has 19 lines fewer), so a ledger written off the work would
//    have named a row no checkout contains and reddened `STALE` on the first clean run. A number that
//    describes nobody's commit is not evidence. So every file whose worktree bytes differ from the index is
//    re-measured FROM THE INDEX by `eslint --stdin --stdin-filename <its own path>` (measured against the
//    same bytes on disk: identical rule ids on identical lines, 4 findings both ways) and the swap is
//    printed. The ledger therefore describes the tree the next commit produces, which is the tree CI checks
//    out and the only one a reader can re-measure.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

export const LEDGER_FILE = 'docs/evidence/ci/lint-debt.json';
export const TOOL_FILE = 'tools/ci/lint-tree.mjs';

/** What ESLint is asked to grade: the extensions its own default `files` patterns reach for this config. */
export const LINTABLE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

/** The four workspace roots of the root manifest — a file directly under one of them belongs to a PACKAGE. */
export const PACKAGE_BASES = ['packages', 'apps', 'services', 'agents'];

/**
 * Directories the ROOT config excludes by name, and who grades them instead. A run over one of these is
 * not a green: ESLint answers "all of the files matching the glob are ignored" with exit 2, so the runner
 * has to know the difference between "nothing to grade" and "graded, clean". Each entry is checked for
 * being still true — an exemption whose subject no longer exists is itself a red (§4).
 */
export const EXEMPT_AREAS = [
  {
    dir: 'apps/studio',
    reason:
      'lints itself: it is a workspace package that declares a `lint` script, run by `npm run lint` = ' +
      '`turbo run lint`, which ci.yml reaches — this file resolves that from its manifest and reddens ' +
      '`UNLINTED EXEMPTION` the day the script is gone — measured passing at its own bytes (eslint 9.39.5, ' +
      '`eslint . --max-warnings=0`, exit 0); it pins eslint-config-next, whose @rushstack patch refuses to ' +
      "load under the root's eslint 10 (measured at the parent's bytes: exit 2 in 4.5 s, and no line of its " +
      'output names a file), so the root run may not descend into it.',
  },
  {
    dir: '.scratch',
    reason:
      "the agents' own byte probes, ignored by the root config next to scratch-*.mjs; each probe is graded by the " +
      'arm that spawns it (the docs/evidence/*/*-arms.mjs batteries), not by a lint pass over a directory that is rewritten mid-run.',
  },
];

/** One tracked file -> the area it is linted in: its package dir, its top-level dir, or `(root)`. */
export function areaOf(file) {
  const rel = file.replace(/\\/g, '/');
  const seg = rel.split('/');
  if (seg.length === 1) return '(root)';
  if (PACKAGE_BASES.includes(seg[0])) return `${seg[0]}/${seg[1]}`;
  return seg[0];
}

/** The area population, derived: every tracked lintable file, bucketed. `tracked` is `git ls-files -z` output. */
export function areasOf(tracked) {
  const counts = new Map();
  for (const file of tracked) {
    if (!LINTABLE.test(file)) continue;
    const a = areaOf(file);
    counts.set(a, (counts.get(a) || 0) + 1);
  }
  return [...counts.entries()].map(([dir, files]) => ({ dir, files })).sort((x, y) => x.dir.localeCompare(y.dir));
}

/** `git ls-files -z` over the lintable extensions, as repo-relative forward-slash paths. */
export function trackedFiles(root = ROOT) {
  const out = spawnSync('git', ['ls-files', '-z', '--', '*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.mjs', '*.cjs'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (out.status !== 0) throw new Error(`git ls-files failed (${out.status}): ${String(out.stderr).slice(0, 200)}`);
  return out.stdout.split('\0').filter(Boolean).map((f) => f.replace(/\\/g, '/'));
}

/**
 * §1b the basis. Tracked lintable files whose WORKTREE bytes differ from the INDEX — a draft that no commit
 * carries yet. The question is asked the direct way (worktree vs index), because a plane has no
 * `node_modules` on this box and only the index holds the bytes the next commit will produce.
 */
export function unstagedLintable(root = ROOT) {
  const out = spawnSync('git', ['diff', '--name-only', '-z', '--', '*.ts', '*.tsx', '*.mts', '*.cts', '*.js', '*.mjs', '*.cjs'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (out.status !== 0) throw new Error(`git diff failed (${out.status}): ${String(out.stderr).slice(0, 200)}`);
  return out.stdout.split('\0').filter(Boolean).map((f) => f.replace(/\\/g, '/'));
}

/** The index's bytes for a path (`git show :path`), or null when the index does not hold it. */
function indexBytes(file, root = ROOT) {
  const out = spawnSync('git', ['show', `:${file}`], { cwd: root, maxBuffer: 1 << 28 });
  return out.status === 0 ? out.stdout : null;
}

/**
 * One file's findings measured from a given byte buffer, under its own path, so the flat config and the
 * type-aware project resolve exactly as they do on disk. `--stdin` is what lets the committed bytes be
 * graded without a second checkout.
 */
function measureBytes(file, buffer) {
  const bin = join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const r = spawnSync(process.execPath, [bin, '--stdin', '--stdin-filename', file, '--format', 'json'], {
    cwd: ROOT,
    input: buffer,
    maxBuffer: 1 << 29,
    windowsHide: true,
  });
  const text = String(r.stdout || '');
  if (r.status === 2 && !text.trim().startsWith('[')) {
    return { crash: `${String(r.stderr || text).replace(/\s+/g, ' ').slice(0, 240)}` };
  }
  let report;
  try {
    report = JSON.parse(text.slice(text.indexOf('[')));
  } catch {
    return { crash: `no JSON on stdout (exit ${r.status})` };
  }
  const perRule = {};
  for (const f of report) {
    for (const m of f.messages) {
      const rule = m.ruleId || '(parse error)';
      perRule[rule] = (perRule[rule] || 0) + 1;
    }
  }
  return { perRule };
}

/**
 * Replace what the worktree said about a file with what the INDEX says, keeping the shape `rule -> file -> n`.
 * Pure, because §5 plants it: the shapes that matter are a drafted file with MORE debt on disk than in the
 * commit (a stranger's edit) and one with LESS (my own fix, graded from the index only once I stage it).
 */
export function spliceBasis(counts, indexCountsByFile) {
  const moved = [];
  const next = {};
  for (const [rule, byFile] of Object.entries(counts)) {
    for (const [file, n] of Object.entries(byFile)) {
      if (indexCountsByFile.has(file)) continue;
      (next[rule] = next[rule] || {})[file] = n;
    }
  }
  for (const [file, perRule] of indexCountsByFile) {
    const before = Object.values(counts).reduce((a, by) => a + (by[file] || 0), 0);
    const after = Object.values(perRule).reduce((a, n) => a + n, 0);
    for (const [rule, n] of Object.entries(perRule)) (next[rule] = next[rule] || {})[file] = n;
    moved.push({ file, before, after });
  }
  return { counts: next, moved };
}

/**
 * §1 the judge. `counts` is `rule -> file -> n` as measured; the ledger has the same shape. Four verdicts,
 * and every one of them is planted by §5 below before the judge is allowed to grade the real tree.
 *
 * The ledger is TIGHT, not a budget: a ceiling must equal reality. The obvious "cap, and stay under it"
 * rule hides a reduction (fix a file, leave its stale cap, spend it again next week) and lets debt move
 * between files under a per-rule total. Requiring equality makes every change an event that has to be
 * re-derived with `--write` — and §6 refuses a `--write` that would RAISE the total, so re-deriving is
 * the way to record a fall, never the way to launder a rise.
 */
export function judge(counts, ledger) {
  const bad = [];
  const declared = ledger && typeof ledger === 'object' ? ledger : {};
  const of = (tree, rule, file) => (tree[rule] && typeof tree[rule] === 'object' ? Number(tree[rule][file] ?? 0) : 0);

  // (1) UNDECLARED — a (rule, file) pair the ledger never names: debt nobody wrote down.
  // (2) GREW — a named pair measured above its own ceiling.
  for (const [rule, byFile] of Object.entries(counts)) {
    for (const [file, n] of Object.entries(byFile)) {
      const named = Boolean(declared[rule] && typeof declared[rule] === 'object' && file in declared[rule]);
      if (!named) bad.push({ kind: 'UNDECLARED', text: `${rule} in ${file} produced ${n} finding(s) and no ledger row names this pair — the rule has ${declared[rule] ? Object.keys(declared[rule]).length : 0} row(s) for other files, so this is new debt, not a re-aim`, cap: 0, measured: n });
      else if (n > of(declared, rule, file)) bad.push({ kind: 'GREW', text: `${rule} in ${file} is at ${n} against its ceiling of ${of(declared, rule, file)} — the ledger may only fall`, cap: of(declared, rule, file), measured: n });
      // (3) LOOSE — the pair is better than the row claims, but not empty: the cap is a hiding place.
      else if (n < of(declared, rule, file)) bad.push({ kind: 'LOOSE', text: `${rule} in ${file} is at ${n} under a ceiling of ${of(declared, rule, file)} — re-derive with \`--write\` so the fall is what the ledger says`, cap: of(declared, rule, file), measured: n });
    }
  }

  // (4) STALE — a row whose finding is gone. A ceiling at zero debt is prose about a fixed file.
  for (const [rule, byFile] of Object.entries(declared)) {
    for (const [file, cap] of Object.entries(byFile)) {
      if (of(counts, rule, file) === 0) bad.push({ kind: 'STALE', text: `the ledger still caps ${rule} in ${file} at ${cap} and the rule produced 0 there — delete the row`, cap, measured: 0 });
    }
  }
  return bad;
}

/**
 * §4 the exemptions are checked for still being true: the directory exists and still holds lintable bytes,
 * and (§4b, below) the door each one names as the substitute grader is a door that really visits it.
 */
export function judgeExemptions(areas) {
  const bad = [];
  const present = new Map(areas.map((a) => [a.dir, a.files]));
  for (const e of EXEMPT_AREAS) {
    if (!present.has(e.dir)) bad.push(`STALE EXEMPTION · ${e.dir} is excused from the lint run and no tracked lintable file is in it any more — the reason is now prose about a directory that is gone (${JSON.stringify(e.reason).slice(0, 60)}…)`);
    if (typeof e.reason !== 'string' || e.reason.length < 60) bad.push(`THIN EXEMPTION · ${e.dir} is excused with ${e.reason ? e.reason.length : 0} characters; an exemption has to say who grades it instead`);
  }
  return bad;
}

/**
 * §4b the part of "it lints itself" a comment cannot establish: which workspace packages exist, and which
 * of them declare a `lint` script. Derived from the ROOT manifest's `workspaces` globs through injected
 * readers, because §5 has to plant a tree without a disk. A directory with no manifest is not a package:
 * the denominator is the manifests, not the folders someone guessed at.
 */
export function workspaceLinters(workspaces, readers) {
  const found = [];
  for (const glob of workspaces) {
    const base = glob.endsWith('/*') ? glob.slice(0, -2) : null;
    const dirs = base ? readers.readdir(base).map((d) => `${base}/${d}`) : [glob];
    for (const dir of dirs) {
      const pkg = readers.readJson(`${dir}/package.json`);
      if (!pkg) continue;
      found.push({ dir, name: String(pkg.name ?? ''), lint: pkg.scripts && typeof pkg.scripts.lint === 'string' ? pkg.scripts.lint : null });
    }
  }
  return found.sort((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * §4b the charge. An exemption claims some OTHER door grades these files; where the door is
 * `turbo run lint`, the claim is readable off one manifest key. Two ways it dies: the package stops
 * declaring the script, and the exempted path stops being a workspace package the door visits. A package
 * this run GRADES is not charged — its own `lint` script is optional, because this file is its reader.
 */
export function judgeSelfLinters(packages, exemptDirs) {
  const bad = [];
  const byDir = new Map(packages.map((p) => [p.dir, p]));
  for (const dir of exemptDirs) {
    if (!PACKAGE_BASES.includes(dir.split('/')[0])) continue;
    const pkg = byDir.get(dir);
    if (!pkg) {
      bad.push(`UNREACHED EXEMPTION · ${dir} is excused as a package that lints itself, and the root manifest's \`workspaces\` globs resolve no package there — the door the exemption names does not visit the directory, so nothing grades its files`);
      continue;
    }
    if (!pkg.lint) bad.push(`UNLINTED EXEMPTION · ${dir} is excused because it lints itself, and its manifest declares no \`lint\` script — \`turbo run lint\` skips a package without that script and reports success, so these files are graded by nothing`);
  }
  return bad;
}

/**
 * §5 the judge tested before it judges. Each planted shape names the verdict it must produce — and only
 * that one — plus a control that must produce none. A validator whose first run is also its first test
 * has no first run.
 */
export const SELF_CASES = [
  { name: 'control', counts: { 'no-unused-vars': { 'a.ts': 2 } }, ledger: { 'no-unused-vars': { 'a.ts': 2 } }, want: [] },
  { name: 'undeclared', counts: { 'no-floating-promises': { 'b.ts': 1 } }, ledger: {}, want: ['UNDECLARED'] },
  { name: 'grew', counts: { 'no-unused-vars': { 'a.ts': 3 } }, ledger: { 'no-unused-vars': { 'a.ts': 2 } }, want: ['GREW'] },
  { name: 'stale', counts: {}, ledger: { 'no-unused-vars': { 'a.ts': 2 } }, want: ['STALE'] },
  { name: 'loose', counts: { 'no-unused-vars': { 'a.ts': 1 } }, ledger: { 'no-unused-vars': { 'a.ts': 2 } }, want: ['LOOSE'] },
  // The shape a per-rule ceiling of 2 would have waved through as "flat": one file fixed, another opened.
  // Two pair(s), total still 2 — the only thing that catches it is that the pairs are named apart.
  {
    name: 'moved-not-reduced',
    counts: { 'no-unused-vars': { 'a.ts': 1, 'c.ts': 1 } },
    ledger: { 'no-unused-vars': { 'a.ts': 2 } },
    want: ['LOOSE', 'UNDECLARED'],
    forbid: ['GREW'],
  },
  // A ceiling of ZERO rows must not be a way to pass, and must not be a way to hide either.
  { name: 'empty-ledger', counts: { 'no-var': { 'x.ts': 1 } }, ledger: {}, want: ['UNDECLARED'] },
];

/**
 * The splice is planted the same way the judge is: a control that must not move a number, and the three
 * movements the shared worktree actually produces. `index` is the file's per-rule count as measured from
 * its INDEX bytes, which is what the run substitutes for whatever the disk said.
 */
export const BASIS_CASES = [
  { name: 'basis-control', worktree: { 'no-unused-vars': { 'a.ts': 2 } }, fromIndex: {}, want: { 'no-unused-vars': { 'a.ts': 2 } } },
  // A stranger's draft: the disk has 4, the commit they will make has 2. Shipping the 4 would name a row no
  // checkout contains, and the first clean run would read it STALE and stop the build for their edit.
  {
    name: 'basis-draft-overstates',
    worktree: { 'no-unused-vars': { 'a.ts': 2, 'draft.ts': 4 } },
    fromIndex: { 'draft.ts': { 'no-unused-vars': 2 } },
    want: { 'no-unused-vars': { 'a.ts': 2, 'draft.ts': 2 } },
  },
  // My own fix, not yet staged: the disk is clean, the index still owes the debt. The gate must charge the
  // commit, not the wish — otherwise staging is what makes the number real and CI is the first to find out.
  {
    name: 'basis-draft-hides-committed-debt',
    worktree: { 'no-unused-vars': { 'a.ts': 0 } },
    fromIndex: { 'a.ts': { 'no-floating-promises': 3 } },
    want: { 'no-floating-promises': { 'a.ts': 3 } },
  },
  // The drafted file ends up with nothing to report at the committed bytes: the pair must go, not linger at 0.
  {
    name: 'basis-row-erased',
    worktree: { 'no-useless-escape': { 'draft.ts': 1 }, 'prefer-const': { 'other.ts': 1 } },
    fromIndex: { 'draft.ts': {} },
    want: { 'prefer-const': { 'other.ts': 1 } },
  },
];

/**
 * §5 once more for the derived premise in §4b, planted on a fake tree so no run of the real manifests
 * decides whether the clause was ever tested: the script deleted, the package deleted, and the control
 * that keeps the clause from charging a file this run already grades.
 */
export const LINTER_CASES = [
  {
    name: 'linter-control',
    workspaces: ['apps/*', 'packages/*'],
    tree: { 'apps/studio/package.json': { name: '@nexus/studio', scripts: { lint: 'eslint .' } }, 'apps/web/package.json': { name: '@nexus/web' } },
    exempt: ['apps/studio'],
    want: [],
  },
  // The `lint` script is deleted and the exemption sentence survives: the door it names now walks past it.
  {
    name: 'linter-script-gone',
    workspaces: ['apps/*'],
    tree: { 'apps/studio/package.json': { name: '@nexus/studio', scripts: {} } },
    exempt: ['apps/studio'],
    want: ['UNLINTED'],
  },
  // The directory still holds files; what vanished is the root manifest's claim on it, so no door visits.
  {
    name: 'linter-not-a-workspace',
    workspaces: ['packages/*'],
    tree: { 'apps/studio/package.json': { name: '@nexus/studio', scripts: { lint: 'eslint .' } } },
    exempt: ['apps/studio'],
    want: ['UNREACHED'],
  },
  // apps/web owes this run no `lint` script: it is graded HERE. A clause that charges this shape is a
  // licence to exempt anything by naming a door that does not visit it.
  {
    name: 'linter-graded-not-exempt',
    workspaces: ['apps/*'],
    tree: { 'apps/web/package.json': { name: '@nexus/web' } },
    exempt: [],
    want: [],
  },
];

export const SHAPES = SELF_CASES.length + BASIS_CASES.length + LINTER_CASES.length;

/** A planted file tree: the readers §4b needs, with no disk under them. */
function plantedReaders(tree) {
  return {
    readdir: (base) => [...new Set(Object.keys(tree).filter((p) => p.startsWith(`${base}/`)).map((p) => p.slice(base.length + 1).split('/')[0]))].sort(),
    readJson: (p) => (p in tree ? tree[p] : null),
  };
}

export function selfTest() {
  const lines = [];
  const failures = [];
  for (const c of SELF_CASES) {
    const verdicts = judge(c.counts, c.ledger);
    const kinds = [...new Set(verdicts.map((v) => v.kind))].sort();
    const missing = c.want.filter((w) => !kinds.includes(w));
    const extra = (c.forbid || []).filter((w) => kinds.includes(w));
    if (c.want.length === 0 && verdicts.length) failures.push(`SELF-TEST ${c.name}: the control was refused · ${verdicts[0].text}`);
    else if (missing.length || extra.length)
      failures.push(`SELF-TEST ${c.name}: expected ${c.want.join('/')}${extra.length ? ` and got ${extra.join('/')} instead` : ' but the judge said ' + (kinds.join('/') || 'nothing')}`);
    else if (kinds.length !== c.want.length)
      failures.push(`SELF-TEST ${c.name}: produced ${kinds.join('/')} — ${kinds.length} verdict kind(s) where the shape plants ${c.want.length}; the knife has an effect nobody predicted`);
    else lines.push(`SELF-TEST ${c.name}: ${c.want.length ? `refused as planted (${kinds.join('/')})` : 'clean'}`);
  }
  for (const c of BASIS_CASES) {
    const { counts, moved } = spliceBasis(c.worktree, new Map(Object.entries(c.fromIndex)));
    const same = JSON.stringify(counts) === JSON.stringify(c.want);
    if (!same) failures.push(`SELF-TEST ${c.name}: the splice left ${JSON.stringify(counts)} where the planted basis says ${JSON.stringify(c.want)} (moved ${JSON.stringify(moved)})`);
    else if (c.name === 'basis-control' && moved.length) failures.push(`SELF-TEST ${c.name}: the control moved a file with nothing staged`);
    else lines.push(`SELF-TEST ${c.name}: ${moved.length ? `basis moved ${moved[0].file} ${moved[0].before}→${moved[0].after} as planted` : 'no basis swap, counts untouched'}`);
  }
  for (const c of LINTER_CASES) {
    const packages = workspaceLinters(c.workspaces, plantedReaders(c.tree));
    const charges = judgeSelfLinters(packages, c.exempt);
    const kinds = [...new Set(charges.map((t) => t.split(' ')[0]))].sort();
    const missing = c.want.filter((w) => !kinds.includes(w));
    if (c.want.length === 0 && charges.length) failures.push(`SELF-TEST ${c.name}: the control was refused · ${charges[0]}`);
    else if (missing.length) failures.push(`SELF-TEST ${c.name}: expected ${c.want.join('/')} but the clause said ${kinds.join('/') || 'nothing'}`);
    else if (kinds.length !== c.want.length) failures.push(`SELF-TEST ${c.name}: produced ${kinds.join('/')} — ${kinds.length} charge(s) where the shape plants ${c.want.length}`);
    else lines.push(`SELF-TEST ${c.name}: ${c.want.length ? `refused as planted (${kinds.join('/')})` : `clean over ${packages.length} planted package(s)`}`);
  }
  return { lines, failures };
}

/** One ESLint child over one area. Exit 2 is a crash, and a crash is not a verdict. */
function lintArea(dir, tracked) {
  const target = dir === '(root)' ? tracked.filter((f) => !f.includes('/')) : [dir];
  const bin = join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const r = spawnSync(process.execPath, [bin, ...target, '--format', 'json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 29,
    windowsHide: true,
  });
  if (r.status === 2 && !String(r.stdout).trim().startsWith('[')) {
    return { dir, crash: `${String(r.stderr || r.stdout).replace(/\s+/g, ' ').slice(0, 240)}`, files: 0, counts: {} };
  }
  let report;
  try {
    report = JSON.parse(r.stdout || '[]');
  } catch {
    return { dir, crash: `no JSON on stdout (exit ${r.status}): ${String(r.stdout).slice(0, 160)}`, files: 0, counts: {} };
  }
  const counts = {};
  let findings = 0;
  for (const f of report) {
    const rel = relative(ROOT, f.filePath).replace(/\\/g, '/');
    for (const m of f.messages) {
      if (!m.ruleId) {
        // A parse error is the surface refusing to be read: it is charged under its own name, never dropped.
        counts['(parse error)'] = counts['(parse error)'] || {};
        counts['(parse error)'][rel] = (counts['(parse error)'][rel] || 0) + 1;
        findings++;
        continue;
      }
      counts[m.ruleId] = counts[m.ruleId] || {};
      counts[m.ruleId][rel] = (counts[m.ruleId][rel] || 0) + 1;
      findings++;
    }
  }
  return { dir, files: report.length, findings, counts, exit: r.status };
}

function readLedgerBody(root = ROOT) {
  const p = join(root, LEDGER_FILE);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const sumOf = (counts) => Object.values(counts).reduce((a, by) => a + Object.values(by).reduce((x, y) => x + y, 0), 0);

/** §6 the shipped ledger is written from a measurement, never typed in — and only to record a FALL. */
function writeLedger(counts, root = ROOT) {
  const total = sumOf(counts);
  const body = {
    generated_by: `${TOOL_FILE} --write`,
    meaning: 'a ceiling is the count THIS (rule, file) pair reached the last time the debt was reduced; a pair above it, a pair not in here, and a pair below it are all red, so the only way to change this file is to fix something',
    findings: total,
    pairs: Object.values(counts).reduce((a, by) => a + Object.keys(by).length, 0),
    ceilings: counts,
  };
  writeFileSync(join(root, LEDGER_FILE), `${JSON.stringify(body, null, 1)}\n`, 'utf8');
  return total;
}

const argv = process.argv.slice(2);
const tracked = trackedFiles();
const allAreas = areasOf(tracked);
const areas = allAreas.filter((a) => !EXEMPT_AREAS.some((e) => e.dir === a.dir));
const exemptLines = EXEMPT_AREAS.map((e) => {
  const found = allAreas.find((a) => a.dir === e.dir);
  return `  EXEMPT   ${e.dir.padEnd(22)} ${String(found ? found.files : 0).padStart(4)} file(s) — ${e.reason}`;
});

/** §4b against the real disk: the root manifest's own globs, resolved by reading the manifests they name. */
const diskReaders = {
  readdir: (base) => {
    try {
      return readdirSync(join(ROOT, base)).sort();
    } catch {
      return [];
    }
  },
  readJson: (rel) => {
    try {
      return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
    } catch {
      return null;
    }
  },
};
const packages = workspaceLinters(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).workspaces, diskReaders);
const linters = packages.filter((p) => p.lint);
const surfacesLine = `surfaces   ${packages.length} workspace package manifest(s) resolved from the root \`workspaces\` globs · a \`lint\` script declared by ${linters.length}${linters.length ? `: ${linters.map((p) => `${p.dir} -> ${p.lint}`).join(' | ')}` : ' — so `npm run lint` grades nothing, and every exemption resting on it is prose'}`;

const self = selfTest();
const exemptFailures = [...judgeExemptions(allAreas), ...judgeSelfLinters(packages, EXEMPT_AREAS.map((e) => e.dir))];

// The header prints before the slow part, and each area arrives the moment its child answers. A run that
// says nothing for five minutes cannot be told from a run that died, and this file exists because a
// surface that prints nothing is how a hole stays hidden — the silence must not be mine.
console.log(`${TOOL_FILE} — the whole tree, one ESLint child per area`);
console.log(`self-test of the judge (planted planes): ${self.failures.length ? `${self.failures.length} FAILED of ${SHAPES}` : `${SHAPES} shapes refused as planted, control clean`}`);
for (const l of self.lines) console.log(`  ${l}`);
for (const l of self.failures) console.log(`  ${l}`);
console.log(`areas ${areas.length} derived from \`git ls-files\` · exempt ${EXEMPT_AREAS.length} named by this file`);
console.log(surfacesLine);
for (const l of exemptLines) console.log(l);
for (const l of exemptFailures) console.log(`  ${l}`);

const results = [];
for (const a of areas) {
  const t0 = Date.now();
  const res = lintArea(a.dir, tracked);
  res.seconds = Math.round((Date.now() - t0) / 1000);
  results.push(res);
  const mark = res.crash ? `CRASH  ${res.crash.slice(0, 120)}` : `${res.findings ?? 0} finding(s)`;
  console.log(`  ${res.crash ? 'RED   ' : 'graded'} ${res.dir.padEnd(24)} ${String(res.files).padStart(4)} file(s)  ${String(res.seconds).padStart(3)}s  ${mark}`);
}

// A parse error is not debt: it is the surface refusing to be read at all. It is pulled out of the ledger's
// reach so it can never be written down as a ceiling, and it reddens on its own (§3).
const merged = {};
const parse = {};
for (const res of results) {
  for (const [rule, byFile] of Object.entries(res.counts || {})) {
    const into = rule === '(parse error)' ? parse : (merged[rule] = merged[rule] || {});
    for (const [file, n] of Object.entries(byFile)) into[file] = (into[file] || 0) + n;
  }
}
const worktreeTotal = Object.values(merged).reduce((a, by) => a + Object.values(by).reduce((x, y) => x + y, 0), 0);

/**
 * §1b applied. Every graded file whose bytes on disk are not the bytes in the index is re-measured FROM THE
 * INDEX, because the ledger and this verdict are claims about a commit, not about somebody's draft. A file
 * no commit carries (unstaged-new) is not in `git diff`, so it cannot reach here unannounced.
 */
function gradeTheIndex(differing) {
  const fromIndex = new Map();
  const notes = [];
  const crashed = [];
  for (const file of differing) {
    const bytes = indexBytes(file);
    if (bytes === null) {
      notes.push(`  BASIS    ${file} is in the worktree and not in the index — the next commit does not carry it, so nothing here grades it`);
      fromIndex.set(file, {});
      continue;
    }
    const m = measureBytes(file, bytes);
    if (m.crash) {
      crashed.push(`${file}: ${m.crash}`);
      continue;
    }
    const before = Object.values(merged).reduce((a, by) => a + (by[file] || 0), 0);
    const after = Object.values(m.perRule).reduce((a, n) => a + n, 0);
    if (before !== after) {
      notes.push(`  BASIS    ${file} — the worktree says ${before}, the INDEX says ${after}; graded from the index, so stage your fix to have it counted`);
    }
    if (!m.perRule['(parse error)'] && parse[file]) {
      notes.push(`  BASIS    ${parse[file]} parse error(s) in ${file} belong to the draft, not to the committed bytes — dropped from the parse charge`);
      delete parse[file];
    }
    fromIndex.set(file, m.perRule);
  }
  return { fromIndex, notes, crashed };
}

const gradedAreas = new Set(areas.map((a) => a.dir));
const differing = unstagedLintable().filter((f) => LINTABLE.test(f) && gradedAreas.has(areaOf(f)));
const basis = gradeTheIndex(differing);
const { counts: measured } = spliceBasis(merged, basis.fromIndex);
const total = sumOf(measured);
const pairs = Object.values(measured).reduce((a, by) => a + Object.keys(by).length, 0);
const basisLines = [...basis.notes];
if (differing.length) {
  basisLines.unshift(`basis    ${differing.length} tracked lintable file(s) differ from the index — the run grades ${total} finding(s) at the committed bytes, where the worktree alone would say ${worktreeTotal}`);
}

const ledgerBody = readLedgerBody();
const ledger = ledgerBody === null ? null : ledgerBody.ceilings;
const verdicts = ledger === null
  ? [{ kind: 'NO LEDGER', text: `${LEDGER_FILE} is missing — the tool will not invent its own ceiling; run \`node ${TOOL_FILE} --write\` and commit the debt it measured` }]
  : judge(measured, ledger);
const crashes = results.filter((r) => r.crash);
for (const c of basis.crashed) verdicts.push({ kind: 'BASIS CRASH', text: `the INDEX bytes of ${c} could not be graded — the run refuses to describe a commit it cannot read` });
const parseFiles = Object.keys(parse).length;
if (parseFiles) verdicts.unshift({ kind: 'PARSE', text: `${sumOf(parse)} error(s) across ${parseFiles} file(s) — the rules never saw them, so this run graded less than it says (${Object.entries(parse).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f} ×${n}`).join(', ')})` });

for (const l of basisLines) console.log(l);
console.log(`measured ${total} finding(s) over ${pairs} (rule, file) pair(s) in ${Object.keys(measured).length} rule(s) at the committed bytes`);
console.log(`ledger   ${LEDGER_FILE}${ledgerBody ? ` at ${ledgerBody.findings} finding(s) over ${ledgerBody.pairs} pair(s)` : ' (absent)'}`);
for (const v of verdicts) console.log(`  ${v.kind.padEnd(12)}· ${v.text}`);
if (argv.includes('--write')) {
  const refuse = [];
  if (self.failures.length) refuse.push(`${self.failures.length} planted shape(s) the judge got wrong — a ledger written by a judge that cannot judge is a licence with a number on it`);
  if (exemptFailures.length) refuse.push(`${exemptFailures.length} exemption(s) whose stated grader is not a door — the population this ledger would describe is not the population anything grades`);
  if (parseFiles) refuse.push(`${parseFiles} file(s) with parse errors`);
  if (crashes.length) refuse.push(`${crashes.length} crashed area(s)`);
  if (basis.crashed.length) refuse.push(`${basis.crashed.length} file(s) the index bytes could not be graded`);
  const laundered = verdicts.filter((v) => v.kind === 'UNDECLARED' || v.kind === 'GREW');
  if (laundered.length) refuse.push(`${laundered.length} new-or-grown pair(s) — re-deriving would write them down as if they had always been owed`);
  if (ledgerBody && total >= ledgerBody.findings) refuse.push(`the measured total ${total} is not below the ledger's ${ledgerBody.findings} — nothing fell`);
  if (refuse.length) {
    console.log(`REFUSED TO WRITE · ${refuse.join('; ')} · a ledger may only be re-derived to record a FALL`);
    process.exit(1);
  }
  const n = writeLedger(measured);
  console.log(`WROTE ${LEDGER_FILE} from this measurement: ${n} finding(s) over ${pairs} pair(s), graded at the committed bytes (${differing.length} file(s) re-measured from the index). Read it, then reduce it — do not re-write it to make the build pass.`);
  process.exit(0);
}
if (self.failures.length || exemptFailures.length || verdicts.length || crashes.length) {
  const kinds = [...new Set(verdicts.map((v) => v.kind))];
  console.log(`REFUSED · ${self.failures.length} judge shape(s) + ${exemptFailures.length} exemption(s) + ${verdicts.length} ledger verdict(s) [${kinds.join(', ')}] + ${crashes.length} crash(es)`);
  process.exit(1);
}
console.log(`LINT CLEAN AGAINST THE LEDGER · ${areas.length} areas, ${total} finding(s) exactly at their ceilings, 0 parse errors, 0 crashes · basis: ${differing.length ? `${differing.length} file(s) re-measured from the index` : 'worktree == index, nothing to re-measure'}`);
