// NEXUS M2 v81 (docs/evidence) — 64th tracked script: the isolated clean checkout, and what it proves.
// Run after `npm run build`:  node docs/evidence/agents/isolated-proof.mjs
//
// v80 named the sweep's third axis — the TREE a tree-walking proof reads — and measured that 27 of the 220
// files this box's proofs indexed belong to no commit. Its own bound said naming is not isolating, and
// queued the honest next step. This script runs that step and grades it on one property above all others:
//
//   THE HOME REPOSITORY'S BUILD MUST NOT MOVE.
//
// Why that is the whole game: `node_modules/@nexus/*` in this repository are ABSOLUTE symlinks into the
// working tree (measured: `agent-runtime -> /d/终极项目/agents/runtime`), so a temp checkout that simply
// reused the home install would compile the HOME sources into the HOME dist, and a sweep would be grading
// a build some other directory wrote. The isolation is proven by a digest, not asserted by a comment.
//
// It also fixes a crash found on the way: `walkedTree()` asked git for the ownership census, and a clean
// checkout has no `.git` — `ls-files` exits 128, which took down the identity block of the first isolated
// run. The census there is UNAVAILABLE rather than zero: absence, not a false answer.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);
const HOME_RUNTIME_DIST = join(root, 'agents', 'runtime', 'dist', 'index.js');

// An independent reader of git, so a claim about HEAD's bytes is not taken from the function under test.
function gitOut(args) {
  const r = spawnSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 1 << 28, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}`);
  return r.stdout;
}

// A second walker, deliberately a copy of the RULE rather than a call to the production one: §4 asks
// "is every file this tree exposes tracked at HEAD?", and answering that with the same function whose
// census behaviour is under test would confirm whatever bug it shares with it.
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.turbo']);
const TEXT_EXT = /\.(ts|tsx|js|jsx|md|json|css)$/i;
function walkPaths(dir, base = '') {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP.has(ent.name)) out.push(...walkPaths(abs, rel));
    } else if (ent.isFile() && TEXT_EXT.test(ent.name) && lstatSync(abs).size <= 256 * 1024) out.push(rel);
  }
  return out;
}

// --- §1 a tree with no `.git` has no census, and says so in every field ---
console.log('§1 干净目录没有 git：所有权普查是「问不了」，不是「一个也没有」');
const bare = join(tmpdir(), `nexus-v81-bare-${Date.now()}`);
mkdirSync(join(bare, 'src'), { recursive: true });
writeFileSync(join(bare, 'src/a.ts'), 'export const a = 1;\n');
writeFileSync(join(bare, 'notes.md'), '# hello\n');
const noGit = await sw.walkedTree(bare, HOME_RUNTIME_DIST);
assert.equal(noGit.gitRepo, false, 'the shape names the absence, so a reader cannot mistake it for a clean tree');
assert.equal(noGit.files, 2, 'the walk itself still happened: two text files, exactly what is on disk');
assert.equal(noGit.bytes, Buffer.byteLength('export const a = 1;\n') + Buffer.byteLength('# hello\n'), 'and the byte total is measured, not inferred');
for (const key of ['tracked', 'untracked', 'untrackedBytes', 'other']) {
  assert.equal(noGit[key], null, `${key} is null: git was not asked, so there is no number to report`);
}
assert.equal(noGit.censusUnknown, noGit.files, 'the whole population lands in the one bin that means "unknown"');
assert.deepEqual(noGit.sample, [], 'and no untracked sample can be offered from a census that does not exist');
const bareTwice = await sw.walkedTree(bare, HOME_RUNTIME_DIST);
assert.equal(bareTwice.digest, noGit.digest, 'the digest is still an identity: stable when asked twice');
writeFileSync(join(bare, 'notes.md'), '# hello!\n');
assert.notEqual((await sw.walkedTree(bare, HOME_RUNTIME_DIST)).digest, noGit.digest, 'and it moves on an edit, even where no census can say who owns the file');
// The fix must cost the repository case nothing: those numbers are the point of v80.
const home = await sw.walkedTree(root, HOME_RUNTIME_DIST);
assert.equal(home.gitRepo, true, 'a real working tree is still asked, and still answers');
assert.ok(Number.isInteger(home.untracked) && home.untracked >= 0, `the worktree's untracked count is still an integer, not a null dressed up as 0 (got ${home.untracked})`);
assert.equal(home.tracked + home.untracked + home.other, home.files, 'the three bins are still exhaustive for a tree that has them');
console.log(`  干净目录 ${noGit.files} 只 · 普查问不了 · 摘要仍是身份；工作区 ${home.files} 只 · tracked ${home.tracked} · untracked ${home.untracked} · ignored-but-read ${home.other}`);

// --- §2 build the clean checkout, and prove where the build went ---
console.log('§2 隔离的第一条判据：主仓库的 dist 一个字节都不能动');
const before = sw.distDigest(root);
const iso = await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, log: (l) => console.log(`  ${l}`) });
const after = sw.distDigest(root);
assert.equal(after.digest, before.digest, `HOME dist digest MOVED while building the isolated tree (${before.digest.slice(0, 16)} → ${after.digest.slice(0, 16)}) — the workspace links point back at the home repo and the isolation is fake`);
assert.equal(after.files, before.files, 'and its population is unchanged too');
const cleanRuntimeLink = join(iso.root, 'node_modules', '@nexus', 'agent-runtime');
const linkResolvesTo = resolve(realpathSync(cleanRuntimeLink));
assert.ok(linkResolvesTo.startsWith(resolve(iso.root)), `the temp tree's @nexus/agent-runtime resolves to ${linkResolvesTo}, outside ${iso.root} — a proof run there would import the home build`);
const homeLink = resolve(realpathSync(join(root, 'node_modules', '@nexus', 'agent-runtime')));
assert.equal(relative(resolve(root), homeLink).split(sep).join('/'), 'agents/runtime', `and the HOME link still resolves to the home sources (got ${homeLink}): nothing here re-pointed it`);
assert.ok(iso.workspace.length >= 5, `the archived package.json declares workspaces; ${iso.workspace.length} links is fewer than the packages that exist (${iso.workspace.join(', ')})`);
assert.equal(iso.linkFailures.length, 0, `third-party junctions failed to build: ${iso.linkFailures.slice(0, 3).join('; ')}`);

// --- §3 what the clean tree built, said out loud rather than smoothed over ---
console.log('§3 干净检出里编译了什么、没编译什么，由 runner 自己说');
assert.ok(iso.build, 'a build was requested, so there is a result to report');
const cleanRuntimeDist = join(iso.root, 'agents', 'runtime', 'dist', 'index.js');
assert.ok(existsSync(cleanRuntimeDist), 'the clean checkout built its OWN agents/runtime/dist — otherwise §4 would grade the home build and prove nothing');
assert.notEqual(readFileSync(cleanRuntimeDist, 'utf8'), readFileSync(HOME_RUNTIME_DIST, 'utf8'), "and the two dists are DIFFERENT bytes: the home build carries this lane's uncommitted edits, the clean one is HEAD's — which is the sentence v78 could only hope for");
if (iso.build.code !== 0) {
  assert.ok(iso.build.failed.length > 0, `build exited ${iso.build.code} but the runner named NO package — a failure nobody can locate is not a finding`);
  console.log(`  build exit ${iso.build.code} in ${(iso.build.ms / 1000).toFixed(1)}s · 命名出的失败包：${iso.build.failed.join(', ')}`);
} else {
  assert.deepEqual(iso.build.failed, [], 'a green build names nothing as failed');
  console.log(`  build exit 0 in ${(iso.build.ms / 1000).toFixed(1)}s · 全部包通过`);
}

// --- §4 the proof, run where nothing is untracked ---
console.log('§4 让读工作树的 proof 在干净检出里跑：语料小了多少，判定变不变');
const proofRel = 'docs/evidence/agents/code-index-proof.mjs';
assert.ok(new Set(gitOut(['ls-tree', '-r', '--name-only', 'HEAD']).split(/\r?\n/)).has(proofRel), `${proofRel} is tracked at HEAD, so the ref's own copy is what runs`);
const cleanTree = await sw.walkedTree(iso.root, cleanRuntimeDist);
const cleanPaths = walkPaths(iso.root).sort();
// ORDERING IS LOAD-BEARING: the first mutation probe dropped an untracked file into the tree HERE and the
// witness stayed GREEN, because `cleanPaths` had already been walked. A probe that cannot reach the line
// which grades it is not a refutation — poison before the walk, or do not claim the walk is guarded.
const trackedAll = new Set(gitOut(['ls-tree', '-r', '--name-only', 'HEAD']).split(/\r?\n/).filter(Boolean));
const notInRef = cleanPaths.filter((p) => !trackedAll.has(p));
assert.deepEqual(notInRef.slice(0, 5), [], `${notInRef.length} files the clean checkout exposes are not tracked at HEAD, e.g. ${notInRef.slice(0, 3).join(', ')} — the archive is supposed to contain the ref and nothing else`);
assert.ok(!cleanPaths.some((p) => p.startsWith('.scratch/')), 'no .scratch/ path is in the corpus: the files that reached a shipped top-5 assertion in the worktree cannot reach one here');
assert.ok(cleanTree.files < home.files, `a clean checkout walks ${cleanTree.files} files against this worktree's ${home.files}: isolation removed ${home.files - cleanTree.files} files no commit owns`);
const cleanRun = await sw.runProof(join(iso.root, proofRel), iso.root, 240_000);
const dirtyRun = await sw.runProof(join(root, proofRel), root, 240_000);
console.log(`  干净检出：ok=${cleanRun.ok} exit=${cleanRun.code} ${cleanRun.ms}ms :: ${cleanRun.tail}${cleanRun.ok ? '' : ' || ' + cleanRun.errTail}`);
console.log(`  工作区：  ok=${dirtyRun.ok} exit=${dirtyRun.code} ${dirtyRun.ms}ms`);
assert.equal(cleanRun.ok, true, `the committed proof is RED against a clean checkout of its own ref — ${cleanRun.tail} || ${cleanRun.errTail}: that is a reproducibility finding this increment must report, not a pass`);
assert.equal(cleanRun.ok, dirtyRun.ok, 'and the VERDICT does not depend on which tree it ran in — the honest shape of this claim: same answer, smaller and wholly owned corpus');

// --- §5 the numbers an amendment will quote ---
console.log('§5 引用这次跑出来的数字，而不是复述');
console.log(`  干净检出语料 ${cleanTree.files} 只 / ${cleanTree.bytes} 字节 · 工作区 ${home.files} 只 / ${home.bytes} 字节 · 差 ${home.files - cleanTree.files} 只 / ${home.bytes - cleanTree.bytes} 字节`);
console.log(`  隔离目录 ${iso.dir} · 主仓库 HEAD ${gitOut(['rev-parse', 'HEAD']).trim().slice(0, 12)} · 主仓库 dist 全程 ${before.digest.slice(0, 16)} / ${after.digest.slice(0, 16)}`);

rmSync(bare, { recursive: true, force: true });
rmSync(iso.dir, { recursive: true, force: true });
console.log(`\n[summary] home dist UNMOVED (${before.digest.slice(0, 16)}, ${before.files} files) across an isolated build · clean checkout walks ${cleanTree.files} of ${home.files} worktree files, every one tracked at HEAD · ${proofRel.split('/').pop()} green in both trees · census-without-git reported as null not 0 · build exit ${iso.build.code}${iso.build.failed.length ? ` naming ${iso.build.failed.join(', ')}` : ''}`);
