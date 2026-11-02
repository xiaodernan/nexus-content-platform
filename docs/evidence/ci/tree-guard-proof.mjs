// NEXUS v567 (docs/evidence/ci) — THE TREE GUARD IS A ROW: a scratch directory OUTSIDE this repository that
// holds a symlink or Windows junction resolving INSIDE it is a loaded weapon pointed at the graded tree, and
// this proof refuses until the guard that names it is proven to name it (ADR 0016 amendment 542).
//
// Why this exists, stated the way §60 requires and measured rather than remembered: on 2026-11-02 this lane ran
// `git worktree remove --force` on a scratch worktree whose `node_modules` was a junction into the checkout, and
// 522 tracked files — apps/studio, agents/runtime, agents/exec-host, packages/* — vanished from the working tree.
// A probe on the same box (git 2.52.0.windows.1, Node 24.18, MSYS coreutils 8.32) measured who follows a link:
//   `git worktree remove --force`  → removed the plane AND EMPTIED the target (3 files → 0)
//   `git worktree remove` (no -f)  → refused while untracked files existed, so it never walked
//   `fs.rmSync(dir,{recursive})`   → removed the link, target intact — every teardown in this repo uses this
//   `rm -rf` (MSYS) / `rmdir /S /Q`→ removed the link, target intact
//   a real symlink, not a junction → survived even `--force`
// So the safety the lane rests on belongs to ONE instrument, and the hazard belongs to a command a person types.
// §5 grades the instrument's guarantee, so the day Node starts following, the build reddens before a lane does;
// §7 grades the LIVE state with the reading that is hers to refuse — the checkout's own workspace links.
//
// The fixture arms at the bottom grade the CLAUSES, and the distinction matters: a mutation plants a plane whose
// shape disagrees with what a clause asserts, so the red proves the clause READS the thing it claims to read.
// The guard itself stays right in every arm. Two arms are pass-arms (T1's opposite, T8) and must witness their
// passage in the printed clause lines, because a clause that never refuses is only discovered when it fails to.
//
// The clauses are refusals-first in the shape they were learned, including the ordering lesson: the guard
// reports the OUTERMOST link only, because a path walked through a link is a path in the tree, not in the plane.
//
// §1–§6 are graded by the fixture arms; §7 and §8 read the LIVE machine and are graded by nothing but
// themselves — §7 refuses the loss this lane actually suffered (a workspace link gone from the checkout) and
// §8 runs the command the refusal text names against a repository in a temp directory, so the sentence a person
// reads before typing `--force` is a measurement re-made on every build rather than a claim copied from a log.
// sweep-budget-ms: 120000
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertRemovable, inside, linksInto, REMEDY, refusalOf, scan, worktrees, inspectWorktrees,
} from '../../../tools/ci/tree-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUARD = 'tools/ci/tree-guard.mjs';
const SELF = 'docs/evidence/ci/tree-guard-proof.mjs';
const CLAUSES = ['§1', '§2', '§3', '§4', '§5', '§6'];

// What the CANONICAL plane always holds. Every arm mutates the plane's shape and expects the clause that reads
// it to refuse; none of them mutates the guard.
const CANON_PLANE_FILES = ['readme.txt', 'sub/deep.txt'];
const CANON_PLANE_LINKS = 2;
const CANON_HAZARD = 'link-into';

/** The flags an arm may set, so §5's sacrificial fixture is built with exactly the same shape as the graded one. */
const SHAPE_FLAGS = [
  'hazardAsDir', 'hazardInSub', 'retargetHazardOut', 'extraHazard', 'noInnerLink', 'cleanIsDirty',
  'followingDelete',
];

/** A link a person can actually make on this platform: junctions need no privilege on Windows, symlinks on POSIX. */
function makeLink(target, link) {
  mkdirSync(dirname(link), { recursive: true });
  if (process.platform === 'win32') symlinkSync(target, link, 'junction');
  else symlinkSync(target, link, 'dir');
}

/** Files under `dir`, counted the way the guard walks: a reparse point is ONE entry, never a subtree. */
function countFiles(dir) {
  let n = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let names;
    try {
      names = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of names) {
      const p = join(d, e.name);
      if (e.isSymbolicLink()) n++;
      else if (e.isDirectory()) stack.push(p);
      else n++;
    }
  }
  return n;
}

/**
 * The fixture's paths and flags. A FAKE graded tree, a plane outside it holding one link into the tree and one
 * link that lands elsewhere, a link-free plane, and a directory somewhere else entirely. Nothing here is the
 * real checkout: a proof must never plant a link into the tree it protects.
 */
function makeFixture(over = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'nexus-tree-guard-'));
  const fx = {
    tmp,
    root: join(tmp, 'tree'),
    plane: join(tmp, 'plane'),
    clean: join(tmp, 'clean-plane'),
    elsewhere: join(tmp, 'somewhere-else'),
    del: (dir) => rmSync(dir, { recursive: true, force: true }),
    delName: 'fs.rmSync(dir,{recursive:true,force:true})',
    hazardAsDir: false,
    hazardInSub: false,
    retargetHazardOut: false,
    extraHazard: false,
    noInnerLink: false,
    cleanIsDirty: false,
    followingDelete: false,
    ...over,
  };
  // §6's list is FORGED, so the clause is graded against a reading rather than against whoever's machine runs
  // the build; the live state is §7's business, and §7 refuses only what this checkout owns.
  fx.list = [fx.clean, fx.elsewhere];
  return fx;
}

/** Build the fixture's contents once its paths exist. Separate from makeFixture so §5 can plant a second one. */
function plant(fx) {
  const mkdir = (p) => mkdirSync(p, { recursive: true });
  mkdir(join(fx.root, 'apps/studio'));
  writeFileSync(join(fx.root, 'apps/studio/main.ts'), 'export const app = 1;\n');
  mkdir(join(fx.root, 'node_modules/@nexus'));
  writeFileSync(join(fx.root, 'node_modules/.keep'), 'keep\n');
  mkdir(join(fx.plane, 'sub'));
  writeFileSync(join(fx.plane, 'readme.txt'), 'the plane\n');
  writeFileSync(join(fx.plane, 'sub/deep.txt'), 'deep\n');
  mkdir(join(fx.clean, 'nested'));
  writeFileSync(join(fx.clean, 'only.txt'), 'clean\n');
  writeFileSync(join(fx.clean, 'nested/also.txt'), 'also\n');
  mkdir(fx.elsewhere);
  writeFileSync(join(fx.elsewhere, 'outside.txt'), 'elsewhere\n');

  // The hazard: a link in the plane that resolves inside the fake tree. `hazardAsDir` plants a real directory in
  // its place, `retargetHazardOut` points it at `somewhere-else`, `hazardInSub` puts it one level deeper.
  const hazardPath = join(fx.plane, fx.hazardInSub ? 'sub/link-into' : 'link-into');
  const hazardTarget = fx.retargetHazardOut ? fx.elsewhere : join(fx.root, 'apps/studio');
  if (fx.hazardAsDir) {
    mkdir(hazardPath);
    writeFileSync(join(hazardPath, 'regular.txt'), 'a directory, not a link\n');
  } else {
    makeLink(hazardTarget, hazardPath);
  }
  makeLink(fx.elsewhere, join(fx.plane, 'link-out'));
  if (fx.extraHazard) makeLink(join(fx.root, 'node_modules'), join(fx.plane, 'link-into-too'));
  if (fx.cleanIsDirty) makeLink(join(fx.root, 'apps'), join(fx.clean, 'link-into-tree'));

  // The exemption must be exercised, not assumed: the tree's OWN node_modules holds a link into the tree.
  if (!fx.noInnerLink) makeLink(join(fx.root, 'apps'), join(fx.root, 'node_modules/@nexus/apps'));
  if (fx.followingDelete) {
    fx.del = (dir) => {
      rmSync(dir, { recursive: true, force: true });
      rmSync(join(fx.root, 'apps/studio/main.ts'), { force: true }); // what a link-following instrument does
    };
    fx.delName = 'a simulated following deleter (the fixture deletes one tree file by hand)';
  }
  return fx;
}

/** A sacrificial fixture with the same shape as `fx`, so §5 tears down a plane rather than the graded one. */
function cloneShape(fx) {
  const over = {};
  for (const flag of SHAPE_FLAGS) over[flag] = fx[flag];
  return plant(makeFixture(over));
}

/**
 * Re-measure the instrument the guard's refusal text names, on a repository that lives only in a temp directory.
 * The prose in `tools/ci/tree-guard.mjs` tells a person what `git worktree remove --force` will do to a plane
 * that links into the tree, and prose learned once rots: this runs the command against a fake repo whose worktree
 * holds one link into that repo, and reports whether the target survived. Nothing here can reach the checkout —
 * the target is a directory inside the same temp tree, so the worst outcome this can produce is a red.
 */
function measureGitInstrument() {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-tree-guard-git-'));
  const repo = join(dir, 'repo');
  const wt = join(dir, 'wt');
  const git = (args, cwd) => spawnSync('git', ['-c', 'user.name=tree-guard', '-c', 'user.email=tree-guard@example.invalid',
    '-c', 'init.defaultBranch=master', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8' });
  try {
    mkdirSync(repo, { recursive: true });
    let r = git(['init', '-q', '.'], repo);
    if (r.status !== 0) return { ok: false, detail: `git init: ${(r.stderr || r.stdout).split('\n')[0]}` };
    mkdirSync(join(repo, 'apps/studio'), { recursive: true });
    writeFileSync(join(repo, 'tracked.txt'), 'tracked\n');
    writeFileSync(join(repo, 'apps/studio/main.ts'), 'export const app = 1;\n');
    r = git(['add', '-A'], repo);
    if (r.status !== 0) return { ok: false, detail: `git add: ${(r.stderr || r.stdout).split('\n')[0]}` };
    r = git(['commit', '-q', '-m', 'fixture repo'], repo);
    if (r.status !== 0) return { ok: false, detail: `git commit: ${(r.stderr || r.stdout).split('\n')[0]}` };
    r = git(['worktree', 'add', '--detach', '-q', wt, 'HEAD'], repo);
    if (r.status !== 0) return { ok: false, detail: `git worktree add: ${(r.stderr || r.stdout).split('\n')[0]}` };
    const linkKind = process.platform === 'win32' ? 'junction' : 'symlink';
    // The worktree's `node_modules` is the plane's own untracked entry, exactly as npm writes it when a scratch
    // worktree reuses a checkout's dependencies: an absolute link back INTO the graded tree.
    const target = join(repo, 'apps/studio');
    makeLink(target, join(wt, 'node_modules'));
    const targetBefore = countFiles(target);
    const repoBefore = countFiles(repo);
    r = git(['worktree', 'remove', '--force', wt], repo);
    const targetAfter = countFiles(target);
    const repoAfter = countFiles(repo);
    const version = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
      ? spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout.trim().replace(/^git version /, '')
      : '(unknown)';
    return {
      ok: true,
      linkKind,
      version,
      treeEmptied: targetAfter < targetBefore,
      before: targetBefore,
      after: targetAfter,
      repoBefore,
      repoAfter,
      removeStatus: r.status,
      detail: `git worktree remove --force exited ${r.status}: ${(r.stderr || r.stdout).split('\n')[0]}`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The six clauses as a function of the fixture, so the arms below grade the same code the build runs. Returns
 * the clauses that printed; a refusal throws and the arm reads how far it got (the frontier rule).
 */
function judge(fx, log = () => {}) {
  const printed = [];
  const pass = (clause, line) => {
    printed.push(clause);
    log(`[${clause}] ${line}`);
  };

  // §1 the walker stops AT a link: the plane's files are the plane's, the links are counted, and nothing that
  // lives behind a link is reported as if it were in the plane.
  const s = scan(fx.plane);
  const seen = s.files.map((f) => f.slice(fx.plane.length + 1).split(sep).join('/')).sort();
  assert.deepEqual(
    seen,
    CANON_PLANE_FILES,
    `§1: the walker enumerated ${JSON.stringify(seen)} in the plane where the canonical fixture plants ${JSON.stringify(CANON_PLANE_FILES)} — a file reached THROUGH a link is a file in the TREE, and a guard built on that count cannot tell a plane from a checkout`,
  );
  assert.equal(
    s.links.length,
    CANON_PLANE_LINKS,
    `§1: the walker found ${s.links.length} reparse point(s) where the fixture plants ${CANON_PLANE_LINKS} — a link the guard cannot see is a link it cannot refuse`,
  );
  assert.ok(!s.files.some((f) => inside(f, fx.root)), '§1: a file inside the graded tree was reported as a plane file, so the walk went through a link');
  pass('§1', `walker stops at the link: ${s.entries} entries read, ${s.files.length} plane file(s), ${s.links.length} link(s), 0 reached through one`);

  // §2 both directions of the real question: the links that land in the tree are EXACTLY the refusal list.
  const i = linksInto(fx.plane, fx.root);
  const named = i.links.map((x) => basename(x.link)).sort();
  assert.deepEqual(
    named,
    [CANON_HAZARD],
    `§2: linksInto named ${JSON.stringify(named)} where the canonical plane calls for ${JSON.stringify([CANON_HAZARD])} — a refusal list that is wrong in either direction is worthless: too few deletes the tree, too many refuses every plane`,
  );
  assert.ok(i.links.every((x) => inside(x.target, fx.root)), '§2: a named link does not actually resolve inside the root, so the classifier is not classifying');
  pass('§2', `refused ${named.length} link(s) into the tree (${named.join(', ')}); the plane's other link lands in ${fx.elsewhere} and is admitted (${i.entries} entries scanned)`);

  // §3 the exemption is measured: the tree's own node_modules DOES hold a link into the tree, and the rule says
  // nothing about it — because refusing it would refuse the checkout this row protects.
  const inner = join(fx.root, 'node_modules');
  const innerScan = scan(inner);
  assert.ok(
    innerScan.links.length >= 1,
    `§3: the fake tree's own node_modules holds ${innerScan.links.length} link(s) — with none planted there is no exemption to measure, and §3 would pass by saying nothing`,
  );
  const c = linksInto(inner, fx.root);
  assert.equal(c.contained, true, `§3: linksInto(${inner}, ${fx.root}) reported contained=false — a directory inside the tree is not a hazard to the tree, and refusing it would refuse the checkout`);
  assert.equal(c.links.length, 0, `§3: the contained scan still returned ${c.links.length} refusal(s); containment must short-circuit, not filter`);
  pass('§3', `containment measured on a planted link: ${innerScan.links.length} link(s) inside ${inner} and 0 refused, because the scanned directory IS in the tree`);

  // §4 the refusal a person can act on, and the CLI that carries it: named link, named root, the remedy, the
  // outermost-only ordering — and the link-free plane admitted, because a guard that cries wolf gets walked past.
  let thrown = null;
  try {
    assertRemovable(fx.plane, fx.root);
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown, `§4: assertRemovable let a plane holding a link into the tree pass — this is the check that would have stopped the 522-file loss (${fx.plane})`);
  const msg = thrown.message;
  for (const needle of [CANON_HAZARD, fx.root, REMEDY.slice(0, 40), 'OUTERMOST']) {
    assert.ok(msg.includes(needle), `§4: the refusal does not carry ${JSON.stringify(needle)} · it said: ${msg.split('\n')[0].slice(0, 240)}`);
  }
  const cli = spawnSync(process.execPath, [join(ROOT, GUARD), '--check', fx.plane, '--root', fx.root], { encoding: 'utf8' });
  const cliClean = spawnSync(process.execPath, [join(ROOT, GUARD), '--check', fx.clean, '--root', fx.root], { encoding: 'utf8' });
  assert.equal(cli.status, 1, `§4: \`--check\` exited ${cli.status} on the hazard plane where the fixture planted a link into the tree · stdout: ${(cli.stdout || '').split('\n')[0].slice(0, 220)}`);
  assert.equal(cliClean.status, 0, `§4: the CLI refused a plane the fixture planted link-free — a guard that cries wolf gets walked past, which is how this hazard survived to 2026-11-02 · stdout: ${(cliClean.stdout || '').slice(0, 240)}`);
  pass('§4', `assertRemovable throws naming the link, its target, the remedy and the order; \`--check\` exits ${cli.status} on the hazard plane and ${cliClean.status} on the clean one`);

  // §5 the instrument guarantee: the recursive delete this repo's teardowns use must NOT reach through a link.
  const sacrificial = cloneShape(fx);
  let rootBefore;
  try {
    rootBefore = countFiles(sacrificial.root);
    const elseBefore = countFiles(sacrificial.elsewhere);
    sacrificial.del(sacrificial.plane);
    const rootAfter = countFiles(sacrificial.root);
    assert.equal(rootAfter, rootBefore, `§5: deleting a plane with ${sacrificial.delName} took the planted tree from ${rootBefore} to ${rootAfter} file(s) — the instrument followed a link into the tree, so NO teardown in this repo is safe and every scratch plane must be unlinked by hand first`);
    const elseAfter = countFiles(sacrificial.elsewhere);
    assert.equal(elseAfter, elseBefore, `§5: the delete also reached the link's outside target (${elseBefore} → ${elseAfter} file(s))`);
    assert.ok(!existsSync(sacrificial.plane), `§5: ${sacrificial.delName} did not delete the plane at all — a deleter that deletes nothing cannot witness anything`);
    pass('§5', `${sacrificial.delName}: the plane is gone and the tree behind its link still holds ${rootAfter} file(s)`);
  } finally {
    rmSync(sacrificial.tmp, { recursive: true, force: true });
  }

  // §6 the reading that a teardown is built on: a list of outside directories, each scanned, each refusal kept.
  const w = inspectWorktrees(fx.root, fx.list);
  assert.equal(w.links.length, 0, `§6: ${refusalOf({ dir: '(forged worktree list)', root: fx.root, links: w.links, entries: 0, truncated: false, contained: false })}`);
  assert.ok(w.outside.length >= 1, `§6: ${w.listed} listed director(ies), none outside ${fx.root} — the clause has nothing to scan and would pass by looking away`);
  const trunc = w.findings.filter((f) => f.truncated);
  assert.deepEqual(trunc, [], `§6: ${trunc.length} scan(s) of the forged list hit the entry cap, so "0 links" there is a guess rather than a reading`);
  pass('§6', `${w.listed} listed, ${w.outside.length} outside the tree, ${w.findings.reduce((a, f) => a + f.entries, 0)} entries read · 0 link(s) into it`);

  return { printed, inspection: w };
}

// ── the build's run: the fixture's clauses, then the live state this checkout owns ───────────────────────
const live = plant(makeFixture());
try {
  judge(live, (line) => console.log(line));

  // §7 the live reading, split by who can act on it. The registered worktrees are PRINTED: a build row that
  // reddened master because a neighbour's scratch plane holds a junction would demand deleting work this lane
  // does not own, and the remedy it names would be the destructive one. What this checkout DOES own is the shape
  // npm builds for it — one link per workspace package — and those are the links the 2026-11-02 delete removed.
  const list = worktrees(ROOT);
  assert.ok(list.some((w) => resolve(w) === ROOT), `§7: \`git worktree list\` returned ${JSON.stringify(list)}, which does not contain ${ROOT} — the parse that §6 grades is not reading this checkout's registry`);
  const real = inspectWorktrees(ROOT, list);
  console.log(`\n[§7] live worktrees: ${real.listed} registered · ${real.outside.length} outside ${ROOT} · ${real.links.length} link(s) into it · ${real.findings.reduce((a, f) => a + f.entries, 0)} entries read`);
  for (const f of real.findings) {
    console.log(`[§7]   ${f.dir} — ${f.links.length ? `${f.links.length} LINK(S) INTO THE TREE (unlink before any removal)` : f.truncated ? 'scan TRUNCATED at the cap' : 'clean'} · ${f.entries} entries read`);
    if (f.links.length) console.log(refusalOf(f));
  }

  const wsNames = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).workspaces
    .flatMap((g) => {
      const dir = g.replace(/\/\*$/, '');
      if (!existsSync(join(ROOT, dir))) return [];
      return readdirSync(join(ROOT, dir))
        .map((d) => join(ROOT, dir, d, 'package.json'))
        .filter((p) => existsSync(p))
        .map((p) => JSON.parse(readFileSync(p, 'utf8')).name)
        .filter((n) => typeof n === 'string' && n.startsWith('@nexus/'));
    })
    .sort();
  assert.ok(wsNames.length > 0, `§7: no @nexus/* workspace package is readable, so the link census below has nothing to check`);
  const linkDir = join(ROOT, 'node_modules', '@nexus');
  const missing = [];
  const wrongTarget = [];
  for (const name of wsNames) {
    const short = name.slice('@nexus/'.length);
    const link = join(linkDir, short);
    let st = null;
    try {
      st = lstatSync(link);
    } catch {
      st = null;
    }
    if (!st) {
      missing.push(short);
      continue;
    }
    if (!st.isSymbolicLink()) {
      wrongTarget.push(`${short} is a real directory, not the link npm writes`);
      continue;
    }
    const pkgDir = resolve(realpathSync(link));
    if (!inside(pkgDir, ROOT)) wrongTarget.push(`${short} resolves OUTSIDE the checkout at ${pkgDir}`);
  }
  assert.deepEqual(missing, [], `§7: node_modules/@nexus is missing the workspace link(s) ${missing.join(', ')} — on 2026-11-02 all seven of these were deleted by a command run against a plane that linked back here, and every module that imports them stopped resolving (remedy: \`npm install\`, or re-create each with fs.symlinkSync(<package dir>, <link>, 'junction'))`);
  assert.deepEqual(wrongTarget, [], `§7: a workspace link does not resolve inside the checkout: ${wrongTarget.join(' · ')}`);
  console.log(`[§7] live workspace links: ${wsNames.length}/${wsNames.length} present and resolving inside ${ROOT}`);

  // §8 the sentence the guard prints is a claim about a command, so the command is run here. Platform-conditional
  // on purpose: a Windows reparse point is followed and a POSIX symlink is not, and the row asserts WHICH — a
  // refusal text that quietly stops being true is the failure mode this whole file was written against.
  const probe = measureGitInstrument();
  assert.ok(probe.ok, `§8: the instrument could not be measured (${probe.detail}) — the guard's refusal names a command this row claims to have re-run, and an unrun claim is prose`);
  const expectFollowed = probe.linkKind === 'junction';
  assert.equal(probe.treeEmptied, expectFollowed, `§8: \`git worktree remove --force\` ${probe.treeEmptied ? 'reached THROUGH' : 'did NOT reach THROUGH'} a ${probe.linkKind} on this box (its target went ${probe.before} → ${probe.after} file(s)), while ${GUARD}'s refusal tells a reader it ${expectFollowed ? 'does' : 'does not'} — ${probe.detail}. One of the two is stale; correct the sentence or the code, not the expectation.`);
  console.log(`[§8] instrument: git ${probe.version} on ${process.platform} · worktree holding a ${probe.linkKind} into the repo, removed with --force · target ${probe.treeEmptied ? `EMPTIED (${probe.before} → ${probe.after} file(s))` : `intact (${probe.before} → ${probe.after} file(s))`} · whole repo ${probe.repoBefore} → ${probe.repoAfter}`);

  assert.ok(existsSync(join(ROOT, GUARD)), `§7: ${GUARD} is not on disk, so this row grades nothing`);
  const selfRow = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
  assert.equal(selfRow['verify:tree-guard'], `node ${SELF}`, `§7: the manifest's verify:tree-guard is ${JSON.stringify(selfRow['verify:tree-guard'])}, not \`node ${SELF}\` — the counter must count itself (amendment 102)`);
  console.log(`\ntree-guard: the walker stops at the link, the refusal is actionable, and the delete this repo uses does not reach through one · ${wsNames.length} workspace link(s) verified`);
} finally {
  rmSync(live.tmp, { recursive: true, force: true });
}

// ── the fixture arms ─────────────────────────────────────────────────────────────────────────────────
const ARMS = [
  { tag: 'T0-control', want: null, opts: {} },
  { tag: 'T1-link-looked-like-a-dir', want: '§1', sig: /the walker enumerated/, opts: { hazardAsDir: true } },
  { tag: 'T2-second-link-into-tree', want: '§1', sig: /found 3 reparse point/, opts: { extraHazard: true } },
  { tag: 'T3-hazard-landed-outside', want: '§2', sig: /named \[\] where/, opts: { retargetHazardOut: true } },
  { tag: 'T4-exemption-unexercised', want: '§3', sig: /holds 0 link/, opts: { noInnerLink: true } },
  { tag: 'T5-clean-plane-dirtied', want: '§4', sig: /refused a plane the fixture planted link-free/, opts: { cleanIsDirty: true } },
  { tag: 'T6-following-deleter', want: '§5', sig: /took the planted tree from/, opts: { followingDelete: true } },
  { tag: 'T7-forged-list-carries-it', want: '§6', sig: /forged worktree list/, after: (fx) => { fx.list = [fx.plane]; } },
  { tag: 'T8-link-at-depth', want: null, opts: { hazardInSub: true }, lines: [/refused 1 link\(s\) into the tree/, /exits 1 on the hazard plane and 0 on the clean one/] },
];

let matched = 0;
for (const arm of ARMS) {
  const fx = plant(makeFixture(arm.opts ?? {}));
  arm.after?.(fx);
  let printed = [];
  const lines = [];
  const capture = (line) => {
    lines.push(line);
    const m = /^\[(§\d)\]/.exec(line);
    if (m) printed.push(m[1]);
  };
  let caught = null;
  try {
    printed = judge(fx, capture).printed;
  } catch (e) {
    caught = e;
  }
  rmSync(fx.tmp, { recursive: true, force: true });
  const bad = [];
  if (arm.want === null) {
    if (caught) bad.push(`the plane was refused after ${printed.length} clause(s): ${caught.message.split('\n')[0].slice(0, 300)}`);
    else if (printed.join(' ') !== CLAUSES.join(' ')) bad.push(`printed [${printed.join(' ')}] rather than all six`);
    // A pass-arm witnesses its own passage: the clause lines must say WHAT they refused, not merely that they
    // did not throw.
    for (const re of arm.lines ?? []) if (!lines.some((l) => re.test(l))) bad.push(`no printed clause line matches ${re}`);
  } else {
    if (!caught) bad.push(`the arm was expected to redden at ${arm.want} and the plane passed all six clauses`);
    else {
      const below = CLAUSES.slice(0, CLAUSES.indexOf(arm.want));
      const missing = below.filter((c) => !printed.includes(c));
      const beyond = printed.filter((c) => CLAUSES.indexOf(c) > CLAUSES.indexOf(arm.want));
      if (missing.length) bad.push(`${missing.join(' ')} did not print, so the red is EARLIER than this arm aimed · it threw: ${caught.message.split('\n')[0].slice(0, 240)}`);
      if (beyond.length) bad.push(`${beyond.join(' ')} printed after the aim, so the red is LATER than this arm aimed`);
      if (arm.sig && !arm.sig.test(caught.message)) bad.push(`the refusal does not carry the sentence ${arm.sig} · it said: ${caught.message.split('\n')[0].slice(0, 300)}`);
    }
  }
  if (bad.length) console.log(`MISMATCH ${arm.tag.padEnd(30)} ${bad.join(' · ')}`);
  else {
    matched++;
    console.log(`MATCHED  ${arm.tag.padEnd(30)} ${arm.want === null ? `all six clauses pass${arm.lines ? ', and the witnessed lines say so' : ''}` : `first red at ${arm.want}, every clause below it printed`}`);
  }
}

console.log(`\n${matched}/${ARMS.length} fixture arms matched`);
assert.equal(matched, ARMS.length, 'a fixture arm that does not match its aim is a refusal nobody measured');
